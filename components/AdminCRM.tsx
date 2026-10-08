"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_BOOKING_URL } from "@/lib/supabase/config";
import ProposalEditor from "@/components/ProposalEditor";
import WhatsAppConversation from "@/components/WhatsAppConversation";
import EmailConversation from "@/components/EmailConversation";
import CRMAnalytics from "@/components/CRMAnalytics";
import CRMMarketingPerformance from "@/components/CRMMarketingPerformance";
import { countCRMRequests, IN_PROGRESS_STATUSES, type CRMStatus } from "@/lib/crm-dashboard";

type CRMContact = {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  email: string | null;
  phone: string | null;
  preferred_language: string | null;
  source: string;
  last_contact_at: string;
  notes: string | null;
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
  pricing_mode?: "group" | "per_person";
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
  metadata?: Record<string, unknown> | null;
};

type CRMMessage = {
  id: string;
  created_at: string;
  request_id: string | null;
  contact_id: string | null;
  direction: "inbound" | "outbound";
  text_body: string | null;
  message_type: string;
  status: "received" | "sent" | "delivered" | "read" | "failed" | "deleted";
  source: string;
  whatsapp_timestamp: string | null;
};

type CRMProposalItem = {
  id: string;
  position: number;
  experience_title: string;
  option_name: string | null;
  proposed_date: string | null;
  proposed_time: string | null;
  guests: number;
  pricing_mode?: "group" | "per_person";
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

type CRMBooking = {
  id: string;
  status: string;
  payment_status: "not_requested" | "awaiting" | "paid" | "refunded";
  payment_method: string | null;
  payment_reference: string | null;
  paid_at: string | null;
  confirmed_at: string | null;
  site_promotion_applied: boolean;
  site_before_price: number | null;
  site_promotion_label: string | null;
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
  external_booking_channel: string | null;
  external_booking_reference: string | null;
  service_started_at: string | null;
  completed_at: string | null;
  no_show_at: string | null;
  cancelled_at: string | null;
  review_requested_at: string | null;
  contact: CRMContact | null;
  booking: CRMBooking | null;
  items: CRMItem[];
  activities: CRMActivity[];
  proposals: CRMProposal[];
  messages: CRMMessage[];
};

type Filter = "all" | "in_progress" | "contacts" | "today" | "upcoming" | CRMStatus;

const OWNER_EMAIL = "c.vasconcelos1969@gmail.com";

const STATUS_LABELS: Record<CRMStatus, string> = {
  new: "New",
  in_review: "In review",
  awaiting_customer: "Waiting for customer",
  proposal_drafting: "Drafting proposal",
  proposal_sent: "Proposal sent",
  customer_replied: "Customer replied",
  accepted: "Accepted",
  awaiting_payment: "Awaiting payment",
  confirmed: "Confirmed",
  in_service: "In service",
  completed: "Completed",
  no_show: "No-show",
  declined: "Declined",
  cancelled: "Cancelled",
};

const KIND_LABELS = {
  personalized_proposal: "Personalized proposal",
  direct_booking: "Direct booking",
  manual: "Manual",
} as const;

function declineWhatsAppText(request: CRMRequest) {
  const customerName = request.contact?.name?.trim();
  const greeting = customerName ? "Hello " + customerName + "," : "Hello,";

  return [
    greeting,
    "",
    "Thank you for your request " + request.reference + ".",
    "After reviewing it, unfortunately we’re unable to accept it under the terms and conditions submitted.",
    "",
    "Thank you for your understanding.",
    "Watermelon Experiences",
  ].join("\n");
}

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

function localIsoDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  return [
    parts.find((part) => part.type === "year")?.value,
    parts.find((part) => part.type === "month")?.value,
    parts.find((part) => part.type === "day")?.value,
  ].join("-");
}

function bookedDates(request: CRMRequest) {
  const latestAccepted =
    request.proposals.find((proposal) => proposal.status === "accepted") ||
    request.proposals[0] ||
    null;

  const proposalDates =
    latestAccepted?.items
      ?.map((item) => item.proposed_date)
      .filter((value): value is string => Boolean(value)) || [];

  if (proposalDates.length) return proposalDates;

  return request.items
    .map((item) => item.requested_date)
    .filter((value): value is string => Boolean(value));
}

function paymentStatusForRequest(request: CRMRequest) {
  if (request.kind === "direct_booking") {
    return request.booking?.payment_status || "not_requested";
  }
  return request.proposals[0]?.payment_status || "not_requested";
}

function daysFromToday(value: string) {
  const today = new Date(localIsoDate() + "T12:00:00Z");
  const target = new Date(value + "T12:00:00Z");
  if (Number.isNaN(target.getTime())) return Number.POSITIVE_INFINITY;
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function operationalRows(request: CRMRequest) {
  const latestAccepted =
    request.proposals.find((proposal) => proposal.status === "accepted") ||
    request.proposals[0] ||
    null;

  if (latestAccepted?.items?.length) {
    return latestAccepted.items.map((item) => ({
      experience: item.experience_title,
      date: item.proposed_date,
      time: item.proposed_time,
      guests: item.guests,
      pickup: item.pickup_location,
      language: request.contact?.preferred_language || null,
    }));
  }

  return request.items.map((item) => ({
    experience: item.experience_title,
    date: item.requested_date,
    time: item.preferred_time,
    guests: item.guests,
    pickup: item.pickup_location,
    language: item.guide_language || request.contact?.preferred_language || null,
  }));
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function extractAiNote(notes: string | null, labels: string[]) {
  if (!notes) return "";

  for (const label of labels) {
    const marker = label + ":";
    const start = notes.toLowerCase().indexOf(marker.toLowerCase());
    if (start < 0) continue;

    const after = notes.slice(start + marker.length).trimStart();
    const line = after.split("\n")[0]?.trim() || "";
    if (line) return line;
  }

  return "";
}

function cleanAiSpecialRequest(value: string | null | undefined) {
  return (value || "")
    .replace(/^AI Concierge:\s*/i, "")
    .replace(/^AI tailor-made concept:\s*/i, "")
    .trim();
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export default function AdminCRM() {
  const [actorEmail, setActorEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginCooldown, setLoginCooldown] = useState(0);
  const [requests, setRequests] = useState<CRMRequest[]>([]);
  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<Filter>("in_progress");
  const [workspaceView, setWorkspaceView] = useState<"operations" | "marketing">("operations");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [pushSupported, setPushSupported] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushPermission, setPushPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const loadSequenceRef = useRef(0);
  const latestMessageIdRef = useRef("");

  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  }, []);

  const loadCRM = useCallback(async () => {
    if (!supabase) return;
    const loadSequence = ++loadSequenceRef.current;
    setLoading(true);

    const [{ data, error }, contactsResult, messagesResult] = await Promise.all([
      supabase
        .from("watermelon_requests")
        .select(`
          *,
          contact:watermelon_contacts(*),
          booking:watermelon_booking_requests!watermelon_requests_linked_booking_id_fkey(*),
          items:watermelon_request_items(*),
          activities:watermelon_activities(*),
          proposals:watermelon_proposals(*, items:watermelon_proposal_items(*)),
          messages:watermelon_messages(*)
        `)
        .order("created_at", { ascending: false }),
      supabase
        .from("watermelon_contacts")
        .select("*")
        .order("last_contact_at", { ascending: false }),
      supabase
        .from("watermelon_messages")
        .select("*")
        .order("whatsapp_timestamp", { ascending: true, nullsFirst: false }),
    ]);

    if (error) {
      setMessage(
        error.code === "42501"
          ? "This account is not authorized for the Watermelon private area."
          : error.message
      );
      setRequests([]);
    } else {
      const allContactMessages = messagesResult.error
        ? null
        : ((messagesResult.data || []) as CRMMessage[]);

      const normalized = ((data || []) as CRMRequest[]).map((request) => {
        const messages =
          allContactMessages && request.contact?.id
            ? allContactMessages.filter(
                (item) => item.contact_id === request.contact?.id
              )
            : [...(request.messages || [])];

        return {
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
          messages: messages.sort(
            (a, b) =>
              new Date(a.whatsapp_timestamp || a.created_at).getTime() -
              new Date(b.whatsapp_timestamp || b.created_at).getTime()
          ),
        };
      });
      if (loadSequence !== loadSequenceRef.current) return;

      const newestMessage = normalized
        .flatMap((request) => request.messages || [])
        .sort(
          (a, b) =>
            new Date(b.whatsapp_timestamp || b.created_at).getTime() -
            new Date(a.whatsapp_timestamp || a.created_at).getTime()
        )[0];
      if (newestMessage?.id) latestMessageIdRef.current = newestMessage.id;

      setRequests(normalized);
    }

    if (loadSequence !== loadSequenceRef.current) return;

    if (!contactsResult.error) {
      setContacts((contactsResult.data || []) as CRMContact[]);
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
    if (!supabase || !signedIn) return;

    let refreshTimer: number | null = null;
    let messageSettleTimer: number | null = null;
    let safetyPollBusy = false;

    const scheduleRefresh = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void loadCRM();
      }, 120);
    };

    const scheduleMessageRefresh = () => {
      scheduleRefresh();

      if (messageSettleTimer !== null) {
        window.clearTimeout(messageSettleTimer);
      }
      messageSettleTimer = window.setTimeout(() => {
        messageSettleTimer = null;
        void loadCRM();
      }, 900);
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };

    const safetyPoll = async () => {
      if (document.visibilityState !== "visible" || safetyPollBusy) return;
      safetyPollBusy = true;

      try {
        const { data } = await supabase
          .from("watermelon_messages")
          .select("id, created_at")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data?.id && data.id !== latestMessageIdRef.current) {
          latestMessageIdRef.current = data.id;
          scheduleMessageRefresh();
        }
      } finally {
        safetyPollBusy = false;
      }
    };

    const channel = supabase
      .channel("watermelon-crm-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "watermelon_requests" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "watermelon_request_items" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "watermelon_proposals" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "watermelon_activities" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "watermelon_messages" },
        scheduleMessageRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "watermelon_contacts" },
        scheduleRefresh
      )
      .subscribe();

    const safetyPollInterval = window.setInterval(() => {
      void safetyPoll();
    }, 2000);

    window.addEventListener("focus", scheduleRefresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      if (messageSettleTimer !== null) window.clearTimeout(messageSettleTimer);
      window.clearInterval(safetyPollInterval);
      window.removeEventListener("focus", scheduleRefresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      void supabase.removeChannel(channel);
    };
  }, [supabase, signedIn, loadCRM]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const reference = (params.get("ref") || params.get("search"))?.trim();
    if (!reference) return;
    setFilter("all");
    setQuery(reference);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const navigatorWithStandalone = window.navigator as Navigator & {
      standalone?: boolean;
    };
    setIsStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        navigatorWithStandalone.standalone === true
    );
  }, []);

  useEffect(() => {
    const supported =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    setPushSupported(supported);
    if (!supported) {
      setPushPermission("unsupported");
      return;
    }

    setPushPermission(Notification.permission);

    navigator.serviceWorker
      .register("/watermelon-crm-sw.js")
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setPushEnabled(Boolean(subscription)))
      .catch(() => setPushEnabled(false));
  }, []);

  useEffect(() => {
    if (
      !supabase ||
      !signedIn ||
      !pushSupported ||
      typeof Notification === "undefined" ||
      Notification.permission !== "granted"
    ) {
      return;
    }

    const client = supabase;
    let cancelled = false;

    async function syncGrantedPushSubscription() {
      try {
        const registration = await navigator.serviceWorker.register(
          "/watermelon-crm-sw.js"
        );
        await navigator.serviceWorker.ready;

        const { data: publicKey, error: keyError } = await client.rpc(
          "watermelon_push_public_key"
        );
        if (keyError || !publicKey) return;

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(String(publicKey)),
          });
        }

        const json = subscription.toJSON();
        const endpoint = subscription.endpoint;
        const p256dh = json.keys?.p256dh;
        const auth = json.keys?.auth;
        if (!endpoint || !p256dh || !auth) return;

        const { error: saveError } = await client.rpc(
          "watermelon_upsert_push_subscription",
          {
            p_endpoint: endpoint,
            p_p256dh: p256dh,
            p_auth: auth,
            p_user_agent: navigator.userAgent,
          }
        );

        if (!saveError && !cancelled) {
          setPushEnabled(true);
          setPushPermission("granted");
        }
      } catch {
        // Keep the manual activation button available.
      }
    }

    void syncGrantedPushSubscription();

    return () => {
      cancelled = true;
    };
  }, [supabase, signedIn, pushSupported]);

  useEffect(() => {
    if (loginCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setLoginCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loginCooldown]);

  async function requestOtp(event?: React.FormEvent) {
    event?.preventDefault();
    if (!supabase) return;

    setLoginLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithOtp({
      email: OWNER_EMAIL,
      options: {
        shouldCreateUser: false,
        emailRedirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/crm`
            : undefined,
      },
    });

    if (error) {
      setMessage(
        error.message.toLowerCase().includes("rate limit")
          ? "Too many codes were requested. Use the most recent code received or wait before requesting another."
          : error.message
      );
    } else {
      setOtpSent(true);
      setOtpCode("");
      setMessage(
        "A secure sign-in email was sent. Open the latest email and tap Sign in. You will return directly to the CRM. If the email contains a 6-digit code instead, enter it below."
      );
      setLoginCooldown(60);
    }

    setLoginLoading(false);
  }

  async function verifyOtp(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;

    const token = otpCode.replace(/\D/g, "").slice(0, 6);
    if (token.length !== 6) {
      setMessage("Enter the 6-digit code from the email.");
      return;
    }

    setLoginLoading(true);
    setMessage("");

    const { error } = await supabase.auth.verifyOtp({
      email: OWNER_EMAIL,
      token,
      type: "email",
    });

    if (error) {
      setMessage("That code is invalid or has expired. Request a new code and try again.");
      setLoginLoading(false);
      return;
    }

    setOtpCode("");
    setOtpSent(false);
    setLoginLoading(false);
    void loadCRM();
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSignedIn(false);
    setRequests([]);
  }

  async function enablePushNotifications() {
    if (!supabase || !pushSupported) return;

    setPushBusy(true);
    setMessage("");

    try {
      const permission = await Notification.requestPermission();
      setPushPermission(permission);
      if (permission !== "granted") {
        setMessage(
          permission === "denied"
            ? "Notifications are blocked in this browser. Allow notifications for this site in the browser settings, then try again."
            : "Notifications were not enabled on this device."
        );
        return;
      }

      const registration = await navigator.serviceWorker.register("/watermelon-crm-sw.js");
      await navigator.serviceWorker.ready;

      const { data: publicKey, error: keyError } = await supabase.rpc(
        "watermelon_push_public_key"
      );

      if (keyError || !publicKey) {
        throw new Error(keyError?.message || "Push public key is unavailable.");
      }

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(String(publicKey)),
        });
      }

      const json = subscription.toJSON();
      const endpoint = subscription.endpoint;
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;

      if (!endpoint || !p256dh || !auth) {
        throw new Error("Browser push subscription is incomplete.");
      }

      const { error: saveError } = await supabase.rpc(
        "watermelon_upsert_push_subscription",
        {
          p_endpoint: endpoint,
          p_p256dh: p256dh,
          p_auth: auth,
          p_user_agent: navigator.userAgent,
        }
      );

      if (saveError) throw saveError;

      setPushEnabled(true);
      setMessage("Notifications enabled on this device.");
      await supabase.rpc("watermelon_send_test_push");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not enable notifications.");
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePushNotifications() {
    if (!supabase || !pushSupported) return;

    setPushBusy(true);
    setMessage("");

    try {
      const registration = await navigator.serviceWorker.getRegistration(
        "/watermelon-crm-sw.js"
      );
      const subscription = await registration?.pushManager.getSubscription();

      if (subscription) {
        const endpoint = subscription.endpoint;
        await supabase.rpc("watermelon_remove_push_subscription", {
          p_endpoint: endpoint,
        });
        await subscription.unsubscribe();
      }

      setPushEnabled(false);
      setMessage("Notifications disabled on this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not disable notifications.");
    } finally {
      setPushBusy(false);
    }
  }

  async function deleteRequestPermanently(request: CRMRequest) {
    if (!supabase) return;

    const firstCheck = window.confirm(
      "Permanently delete request " +
        request.reference +
        "? This removes the request, its messages, activity, proposals and linked booking data. This cannot be undone."
    );
    if (!firstCheck) return;

    const typed = window.prompt(
      "For safety, type DELETE to permanently remove " + request.reference + ".",
      ""
    );
    if (typed !== "DELETE") {
      setMessage("Deletion cancelled.");
      return;
    }

    setEditing(request.id);
    setMessage("");

    const { error } = await supabase.rpc("watermelon_delete_request", {
      p_request_id: request.id,
    });

    if (error) {
      setMessage(error.message);
      setEditing(null);
      return;
    }

    setMessage("Request " + request.reference + " was permanently deleted.");
    await loadCRM();
    setEditing(null);
  }

  async function deleteContactPermanently(
    contact: CRMContact,
    relatedRequestCount: number
  ) {
    if (!supabase) return;

    if (relatedRequestCount > 0) {
      setMessage(
        "This contact still has " +
          relatedRequestCount +
          " request" +
          (relatedRequestCount === 1 ? "" : "s") +
          ". Delete those requests first, then the contact can be removed permanently."
      );
      return;
    }

    const firstCheck = window.confirm(
      'Permanently delete contact "' +
        contact.name +
        '"? This removes the contact and any standalone WhatsApp messages or activity linked only to this contact. This cannot be undone.'
    );
    if (!firstCheck) return;

    const typed = window.prompt(
      'For safety, type DELETE to permanently remove "' + contact.name + '".',
      ""
    );
    if (typed !== "DELETE") {
      setMessage("Deletion cancelled.");
      return;
    }

    setEditing(contact.id);
    setMessage("");

    const { error } = await supabase.rpc("watermelon_delete_contact", {
      p_contact_id: contact.id,
    });

    if (error) {
      setMessage(error.message);
      setEditing(null);
      return;
    }

    setMessage('Contact "' + contact.name + '" was permanently deleted.');
    await loadCRM();
    setEditing(null);
  }

  async function sendDeclineWhatsApp(request: CRMRequest) {
    if (!supabase) {
      return "Request declined, but WhatsApp is not available in this session.";
    }

    if (!request.contact?.phone) {
      return "Request declined. This customer has no WhatsApp phone number, so no automatic message was sent.";
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      return "Request declined, but the private-area session expired before the WhatsApp message could be sent.";
    }

    try {
      const response = await fetch(
        SUPABASE_BOOKING_URL + "/functions/v1/watermelon-whatsapp-send-v2",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + accessToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            request_id: request.id,
            text: declineWhatsAppText(request),
            purpose: "decline",
          }),
        }
      );

      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        hint?: string;
        mode?: "text" | "template";
        code?: number | string | null;
      };

      if (!response.ok || !data.ok) {
        return (
          "Request declined, but the automatic WhatsApp message could not be sent. " +
          ([data.error, data.hint].filter(Boolean).join(" ") ||
            "Please send the customer a message manually.")
        );
      }

      return data.mode === "template"
        ? "Request declined. An approved WhatsApp template was sent automatically."
        : "Request declined. The customer was notified automatically by WhatsApp.";
    } catch (error) {
      return (
        "Request declined, but the automatic WhatsApp message could not be sent. " +
        (error instanceof Error ? error.message : "Please send the customer a message manually.")
      );
    }
  }

  async function sendCRMText(
    request: CRMRequest,
    text: string,
    purpose: "payment" | "acceptance" = "acceptance"
  ) {
    if (!supabase) throw new Error("CRM session is unavailable.");
    if (!request.contact?.phone) {
      return { mode: "copy" as const };
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      throw new Error("Your private-area session has expired. Please sign in again.");
    }

    const response = await fetch(
      SUPABASE_BOOKING_URL + "/functions/v1/watermelon-whatsapp-send-v2",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          request_id: request.id,
          text,
          purpose,
        }),
      }
    );

    const data = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      hint?: string;
      mode?: "text" | "template" | "pending" | "payment_template";
    };

    if (!response.ok || !data.ok) {
      throw new Error(
        [data.error, data.hint].filter(Boolean).join(" ") ||
          "WhatsApp could not send the message."
      );
    }

    return { mode: data.mode || "text" };
  }

  async function acceptProposalRequest(
    request: CRMRequest,
    withPayment: boolean
  ) {
    if (!supabase || request.kind === "direct_booking") return;

    const latest = request.proposals[0] || null;

    if (withPayment && !latest) {
      setMessage(
        "Create or save the proposal first. Then the CRM can accept it and generate the secure payment link."
      );
      return;
    }

    const confirmed = window.confirm(
      withPayment
        ? "Accept this request and prepare the secure payment link now?"
        : "Accept this request without requesting payment now?"
    );
    if (!confirmed) return;

    setEditing(request.id);
    setMessage("");

    const { data, error } = await supabase.rpc(
      "watermelon_admin_accept_request",
      {
        p_request_id: request.id,
        p_with_payment: withPayment,
      }
    );

    if (error || !data) {
      setMessage(error?.message || "The request could not be accepted.");
      setEditing(null);
      return;
    }

    const payload = data as {
      status?: CRMStatus;
      proposal_id?: string | null;
      proposal_version?: number | null;
      proposal_total?: number | null;
      payment_status?: "not_requested" | "awaiting" | "paid" | "refunded";
      payment_token?: string | null;
    };

    let feedback = withPayment
      ? "Request accepted and payment prepared."
      : "Request accepted. Payment was not requested.";

    if (withPayment && payload.payment_token) {
      const paymentUrl =
        window.location.origin +
        "/payment/" +
        encodeURIComponent(request.reference) +
        "?token=" +
        encodeURIComponent(payload.payment_token);

      const paymentText = [
        "Hello " + (request.contact?.name || "") + ",",
        "",
        "Your Watermelon Experiences request has been accepted.",
        "Reference: " + request.reference,
        payload.proposal_total !== null && payload.proposal_total !== undefined
          ? "Amount: " + money(Number(payload.proposal_total), request.currency)
          : "",
        "",
        "Choose your preferred payment method securely here:",
        paymentUrl,
        "",
        "You can choose PayPal, Revolut or bank transfer.",
        "",
        "Watermelon Experiences",
      ]
        .filter(Boolean)
        .join("\n");

      try {
        const delivery = await sendCRMText(request, paymentText, "payment");
        if (delivery.mode === "copy") {
          try {
            await navigator.clipboard.writeText(paymentUrl);
            feedback =
              "Request accepted. Payment link copied because this contact has no WhatsApp number.";
          } catch {
            feedback =
              "Request accepted and payment prepared, but this contact has no WhatsApp number.";
          }
        } else if (delivery.mode === "template") {
          feedback =
            "Request accepted. WhatsApp's 24-hour service window is closed, so one approved Watermelon template was sent. The secure payment link is queued and will be sent automatically as soon as the customer replies.";
        } else if (delivery.mode === "pending") {
          feedback =
            "Request accepted. An approved Watermelon template was already sent recently, so no duplicate message was sent. The secure payment link is queued and will be sent automatically as soon as the customer replies.";
        } else if (delivery.mode === "payment_template") {
          feedback =
            "Request accepted and the secure payment link was sent through the approved Watermelon WhatsApp payment template.";
        } else {
          feedback =
            "Request accepted and the secure payment link was sent from the CRM.";
        }

        await supabase.from("watermelon_activities").insert({
          request_id: request.id,
          contact_id: request.contact?.id || null,
          activity_type:
            delivery.mode === "text" || delivery.mode === "payment_template"
              ? "payment_link_sent"
              : "payment_link_queued",
          summary:
            delivery.mode === "text" || delivery.mode === "payment_template"
              ? "Secure payment link sent from CRM"
              : "Secure payment link queued for WhatsApp after customer reply",
          metadata: {
            proposal_id: payload.proposal_id || null,
            payment_link: paymentUrl,
            mode: delivery.mode,
          },
          actor_email: actorEmail || null,
        });
      } catch (sendError) {
        feedback =
          "Request accepted and payment prepared, but the payment link could not be sent automatically. " +
          (sendError instanceof Error ? sendError.message : "");
      }
    }

    await loadCRM();
    setMessage(feedback.trim());
    setEditing(null);
  }

  async function resendPaymentLink(request: CRMRequest) {
    if (!supabase || request.kind === "direct_booking") return;

    const latest = request.proposals[0] || null;
    if (!latest?.payment_token || latest.payment_status === "paid") {
      setMessage("There is no pending secure payment link to resend for this request.");
      return;
    }

    const confirmed = window.confirm("Resend the secure payment link to this customer now?");
    if (!confirmed) return;

    const paymentUrl =
      window.location.origin +
      "/payment/" +
      encodeURIComponent(request.reference) +
      "?token=" +
      encodeURIComponent(latest.payment_token);

    const paymentText = [
      "Hello " + (request.contact?.name || "") + ",",
      "",
      "Your Watermelon Experiences payment link is ready.",
      "Reference: " + request.reference,
      "Amount: " + money(Number(latest.total), request.currency),
      "",
      "Pay securely here:",
      paymentUrl,
      "",
      "You can choose PayPal, Revolut or bank transfer.",
      "",
      "Watermelon Experiences",
    ].join("\n");

    setEditing(request.id);
    setMessage("");

    try {
      const delivery = await sendCRMText(request, paymentText, "payment");
      const sent =
        delivery.mode === "text" || delivery.mode === "payment_template";

      if (sent) {
        await supabase.from("watermelon_activities").insert({
          request_id: request.id,
          contact_id: request.contact?.id || null,
          activity_type: "payment_link_sent",
          summary: "Secure payment link resent from CRM",
          metadata: {
            proposal_id: latest.id,
            payment_link: paymentUrl,
            mode: delivery.mode,
          },
          actor_email: actorEmail || null,
        });

        setMessage(
          delivery.mode === "payment_template"
            ? "Secure payment link sent through the approved Watermelon WhatsApp payment template."
            : "Secure payment link resent from the CRM to WhatsApp."
        );
      } else {
        await supabase.from("watermelon_activities").insert({
          request_id: request.id,
          contact_id: request.contact?.id || null,
          activity_type: "payment_link_queued",
          summary: "Secure payment link not sent yet",
          metadata: {
            proposal_id: latest.id,
            payment_link: paymentUrl,
            mode: delivery.mode,
          },
          actor_email: actorEmail || null,
        });

        setMessage(
          "The secure payment link has not been sent yet. WhatsApp is still preventing free-form delivery outside the 24-hour customer-service window."
        );
      }

      await loadCRM();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The secure payment link could not be sent."
      );
    } finally {
      setEditing(null);
    }
  }

  async function changeStatus(request: CRMRequest, status: CRMStatus) {
    if (!supabase || request.status === status) return;

    if (status === "declined") {
      const confirmed = window.confirm(
        "Decline this request and automatically notify the customer by WhatsApp?"
      );
      if (!confirmed) return;
    }

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

    let statusFeedback = "";
    if (status === "declined") {
      statusFeedback = await sendDeclineWhatsApp(request);
    }

    await loadCRM();
    if (statusFeedback) setMessage(statusFeedback);
    setEditing(null);
  }

  async function acceptDirectBooking(request: CRMRequest) {
    if (!supabase || request.kind !== "direct_booking") return;

    const confirmed = window.confirm(
      "Accept this booking request after your review? No payment will be requested until you choose to send the payment options."
    );
    if (!confirmed) return;

    setEditing(request.id);
    setMessage("");

    const { error } = await supabase.rpc("watermelon_accept_direct_booking", {
      p_request_id: request.id,
    });

    if (error) {
      setMessage(error.message);
      setEditing(null);
      return;
    }

    await loadCRM();
    setEditing(null);
  }

  async function prepareDirectBookingPayment(request: CRMRequest) {
    if (!supabase || request.kind !== "direct_booking") return;

    setEditing(request.id);
    setMessage("");

    const { data, error } = await supabase.rpc(
      "watermelon_prepare_direct_booking_payment",
      { p_request_id: request.id }
    );

    if (error || !data) {
      setMessage(error?.message || "Could not prepare the payment request.");
      setEditing(null);
      return;
    }

    const payload = data as {
      reference: string;
      payment_token: string;
      customer_name: string;
      customer_phone: string;
      amount: number | null;
      currency: string;
      experience_title: string;
    };

    const paymentUrl =
      window.location.origin +
      "/payment/" +
      encodeURIComponent(payload.reference) +
      "?token=" +
      encodeURIComponent(payload.payment_token);

    const phone = (payload.customer_phone || "").replace(/[^0-9]/g, "");
    const lines = [
      "Hello " + payload.customer_name + ",",
      "",
      "We have now accepted your Watermelon booking request " + payload.reference + " after reviewing the details and availability.",
      "Experience: " + payload.experience_title,
      payload.amount !== null
        ? "Amount to pay: " + money(payload.amount, payload.currency)
        : "Amount: as agreed",
      "",
      "Choose your preferred payment method securely here:",
      paymentUrl,
      "",
      "You can choose PayPal, Revolut or bank transfer.",
      "The booking becomes confirmed once the payment is received and validated by Watermelon.",
    ].filter(Boolean);

    await loadCRM();
    setEditing(null);

    if (phone) {
      window.location.href =
        "https://wa.me/" + phone + "?text=" + encodeURIComponent(lines.join("\n"));
    } else {
      try {
        await navigator.clipboard.writeText(paymentUrl);
        setMessage("Payment link copied. This contact has no phone number.");
      } catch {
        setMessage("Payment request prepared. This contact has no phone number.");
      }
    }
  }

  async function markDirectBookingPaid(request: CRMRequest) {
    if (!supabase || request.kind !== "direct_booking") return;

    const methodInput = window.prompt(
      "Payment method: paypal, revolut or bank_transfer",
      ""
    );
    if (methodInput === null) return;

    const method = methodInput.trim().toLowerCase().replace(/[ -]+/g, "_");
    if (!["paypal", "revolut", "bank_transfer"].includes(method)) {
      setMessage("Use paypal, revolut or bank_transfer as the payment method.");
      return;
    }

    const paymentReference = window.prompt("Payment reference (optional)", "");
    if (paymentReference === null) return;

    setEditing(request.id);
    setMessage("");

    const { error } = await supabase.rpc("watermelon_mark_direct_booking_paid", {
      p_request_id: request.id,
      p_method: method,
      p_reference: paymentReference.trim() || null,
    });

    if (error) {
      setMessage(error.message);
      setEditing(null);
      return;
    }

    await loadCRM();
    setEditing(null);
  }

  async function saveInternalNote(request: CRMRequest) {
    if (!supabase) return;

    const note = window.prompt(
      "Internal / operational note",
      request.admin_notes || ""
    );
    if (note === null) return;

    setEditing(request.id);
    setMessage("");

    const { error } = await supabase
      .from("watermelon_requests")
      .update({
        admin_notes: note.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", request.id);

    if (error) {
      setMessage(error.message);
      setEditing(null);
      return;
    }

    await supabase.from("watermelon_activities").insert({
      request_id: request.id,
      contact_id: request.contact?.id || null,
      activity_type: "internal_note_updated",
      summary: note.trim() ? "Internal operational note updated" : "Internal operational note cleared",
      actor_email: actorEmail || null,
      metadata: {},
    });

    await loadCRM();
    setMessage(note.trim() ? "Internal note saved." : "Internal note cleared.");
    setEditing(null);
  }

  function openWhatsAppOperationalMessage(
    request: CRMRequest,
    kind: "confirmation" | "reminder"
  ) {
    const phone = (request.contact?.phone || "").replace(/[^0-9]/g, "");
    if (!phone) {
      setMessage("This customer has no WhatsApp phone number.");
      return;
    }

    const rows = operationalRows(request);
    const first = rows[0];
    const experience =
      rows.length > 1
        ? rows.map((row) => row.experience).join(" / ")
        : first?.experience || "Watermelon experience";
    const date = first?.date ? shortDate(first.date) : "as agreed";
    const time = first?.time || "as agreed";
    const guests = rows.reduce((sum, row) => sum + Number(row.guests || 0), 0);
    const pickup = first?.pickup ? "\nPickup: " + first.pickup : "";
    const greeting = request.contact?.name?.trim()
      ? "Hello " + request.contact.name.trim() + ","
      : "Hello,";

    const lines =
      kind === "confirmation"
        ? [
            greeting,
            "",
            "Your Watermelon Experiences booking " + request.reference + " is confirmed.",
            "Experience: " + experience,
            "Date: " + date,
            "Time: " + time,
            guests ? "Guests: " + guests : "",
            pickup,
            "",
            "If you need to update any detail, just reply to this message.",
            "Watermelon Experiences",
          ]
        : [
            greeting,
            "",
            "A quick reminder for your upcoming Watermelon Experiences booking " + request.reference + ".",
            "Experience: " + experience,
            "Date: " + date,
            "Time: " + time,
            guests ? "Guests: " + guests : "",
            pickup,
            "",
            "We look forward to welcoming you. If anything changes, please let us know.",
            "Watermelon Experiences",
          ];

    window.location.href =
      "https://wa.me/" + phone + "?text=" + encodeURIComponent(lines.filter(Boolean).join("\n"));
  }

  function printTodayManifest() {
    const today = localIsoDate();
    const todayRequests = requests.filter(
      (request) =>
        ["confirmed", "in_service", "completed", "no_show"].includes(request.status) &&
        bookedDates(request).includes(today)
    );

    const rows = todayRequests.flatMap((request) =>
      operationalRows(request)
        .filter((row) => row.date === today)
        .map((row) => ({
          time: row.time || "—",
          customer: request.contact?.name || "Customer",
          phone: request.contact?.phone || "—",
          experience: row.experience,
          guests: row.guests,
          pickup: row.pickup || "—",
          language: row.language || "—",
          payment: paymentStatusForRequest(request),
          external: request.external_booking_reference
            ? (request.external_booking_channel || "External") +
              " · " +
              request.external_booking_reference
            : "—",
          status: STATUS_LABELS[request.status],
          notes: request.admin_notes || "",
        }))
    );

    rows.sort((a, b) => a.time.localeCompare(b.time));

    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) {
      setMessage("The browser blocked the manifest window. Allow pop-ups and try again.");
      return;
    }

    const manifestRows = rows
      .map(
        (row) => `
          <tr>
            <td>${escapeHtml(row.time)}</td>
            <td><strong>${escapeHtml(row.customer)}</strong><br><small>${escapeHtml(row.phone)}</small></td>
            <td>${escapeHtml(row.experience)}</td>
            <td>${escapeHtml(row.guests)}</td>
            <td>${escapeHtml(row.pickup)}</td>
            <td>${escapeHtml(row.language)}</td>
            <td>${escapeHtml(row.payment)}</td>
            <td>${escapeHtml(row.external)}</td>
            <td>${escapeHtml(row.status)}</td>
            <td>${escapeHtml(row.notes)}</td>
          </tr>`
      )
      .join("");

    popup.document.write(`<!doctype html>
      <html>
        <head>
          <title>Watermelon daily manifest — ${escapeHtml(shortDate(today))}</title>
          <meta charset="utf-8" />
          <style>
            body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:24px;color:#111}
            h1{margin:0 0 4px;font-size:24px}
            p{margin:0 0 20px;color:#555}
            table{width:100%;border-collapse:collapse;font-size:12px}
            th,td{border:1px solid #ddd;padding:8px;text-align:left;vertical-align:top}
            th{background:#f3f3f3}
            small{color:#666}
            @media print{body{margin:10mm}button{display:none}}
          </style>
        </head>
        <body>
          <h1>Watermelon Experiences — Daily Manifest</h1>
          <p>${escapeHtml(shortDate(today))} · ${rows.length} service row${rows.length === 1 ? "" : "s"}</p>
          <table>
            <thead>
              <tr>
                <th>Time</th><th>Guest</th><th>Experience</th><th>Pax</th>
                <th>Pickup</th><th>Language</th><th>Payment</th>
                <th>External ref.</th><th>Status</th><th>Internal notes</th>
              </tr>
            </thead>
            <tbody>${manifestRows || '<tr><td colspan="10">No services scheduled for today.</td></tr>'}</tbody>
          </table>
          <script>window.onload=()=>window.print();<\/script>
        </body>
      </html>`);
    popup.document.close();
  }

  async function saveExternalBookingReference(request: CRMRequest) {
    if (!supabase) return;

    const channel = window.prompt(
      "External channel / supplier (optional, e.g. Viator, partner, hotel)",
      request.external_booking_channel || ""
    );
    if (channel === null) return;

    const reference = window.prompt(
      "External booking reference (leave blank to clear)",
      request.external_booking_reference || ""
    );
    if (reference === null) return;

    setEditing(request.id);
    setMessage("");

    const { error } = await supabase.rpc("watermelon_set_external_booking_reference", {
      p_request_id: request.id,
      p_channel: channel.trim() || null,
      p_reference: reference.trim() || null,
    });

    if (error) setMessage(error.message);
    else {
      await loadCRM();
      setMessage(
        reference.trim()
          ? "External booking reference saved."
          : "External booking reference cleared."
      );
    }
    setEditing(null);
  }

  async function setOperationalStatus(
    request: CRMRequest,
    status: "in_service" | "completed" | "no_show"
  ) {
    if (!supabase) return;

    const label =
      status === "in_service"
        ? "Check in this booking and mark the experience as started?"
        : status === "completed"
          ? "Mark this experience as completed?"
          : "Mark this guest as a no-show?";

    if (!window.confirm(label)) return;

    setEditing(request.id);
    setMessage("");

    const { error } = await supabase.rpc("watermelon_set_request_operation_status", {
      p_request_id: request.id,
      p_status: status,
    });

    if (error) setMessage(error.message);
    else {
      await loadCRM();
      setMessage(
        status === "in_service"
          ? "Check-in recorded."
          : status === "completed"
            ? "Experience marked as completed."
            : "No-show recorded."
      );
    }
    setEditing(null);
  }

  async function cancelBooking(request: CRMRequest) {
    if (!supabase) return;

    const reason = window.prompt(
      "Cancellation reason (optional)",
      ""
    );
    if (reason === null) return;

    if (!window.confirm("Cancel this booking? Payment records will be preserved.")) return;

    setEditing(request.id);
    setMessage("");

    const { data, error } = await supabase.rpc("watermelon_cancel_request", {
      p_request_id: request.id,
      p_reason: reason.trim() || null,
    });

    if (error) {
      setMessage(error.message);
    } else {
      const payload = data as { refund_required?: boolean } | null;
      await loadCRM();
      setMessage(
        payload?.refund_required
          ? "Booking cancelled. Payment had already been received — refund review is required."
          : "Booking cancelled."
      );
    }
    setEditing(null);
  }

  async function markRefunded(request: CRMRequest) {
    if (!supabase) return;

    const reference = window.prompt(
      "Refund reference (optional)",
      ""
    );
    if (reference === null) return;

    if (!window.confirm("Confirm that the refund has actually been completed?")) return;

    setEditing(request.id);
    setMessage("");

    const { error } = await supabase.rpc("watermelon_mark_request_refunded", {
      p_request_id: request.id,
      p_refund_reference: reference.trim() || null,
    });

    if (error) setMessage(error.message);
    else {
      await loadCRM();
      setMessage("Refund recorded.");
    }
    setEditing(null);
  }

  async function requestTripadvisorReview(request: CRMRequest) {
    if (!supabase) return;

    const phone = (request.contact?.phone || "").replace(/[^0-9]/g, "");
    if (!phone) {
      setMessage("This customer has no WhatsApp phone number.");
      return;
    }

    const text = [
      "Hello " + (request.contact?.name || "") + ",",
      "",
      "Thank you for choosing Watermelon Experiences. We hope you enjoyed your experience with us.",
      "If you have a moment, we would really appreciate your review on Tripadvisor:",
      "https://www.tripadvisor.pt/Attraction_Review-g1022768-d15274843-Reviews-Watermelon_Experiences_Lisbon_Portugal-Almada_Setubal_District_Alentejo.html",
      "",
      "Thank you,",
      "Watermelon Experiences",
    ].join("\n");

    setEditing(request.id);
    setMessage("");

    const { error } = await supabase.rpc("watermelon_mark_review_requested", {
      p_request_id: request.id,
    });

    if (error) {
      setMessage(error.message);
      setEditing(null);
      return;
    }

    await loadCRM();
    setEditing(null);
    window.location.href =
      "https://wa.me/" + phone + "?text=" + encodeURIComponent(text);
  }

  function openView(nextFilter: Filter) {
    setWorkspaceView("operations");
    setFilter(nextFilter);
    setQuery("");
    window.setTimeout(() => {
      document.getElementById("crm-results")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 40);
  }

  async function declineDirectBooking(request: CRMRequest) {
    if (!supabase || request.kind !== "direct_booking") return;

    const confirmed = window.confirm(
      "Decline this booking request and automatically notify the customer by WhatsApp?"
    );
    if (!confirmed) return;

    setEditing(request.id);
    setMessage("");

    const { error } = await supabase.rpc("watermelon_decline_direct_booking", {
      p_request_id: request.id,
    });

    if (error) {
      setMessage(error.message);
      setEditing(null);
      return;
    }

    const declineFeedback = await sendDeclineWhatsApp(request);

    await loadCRM();
    setMessage(declineFeedback);
    setEditing(null);
  }

  const counts = useMemo(
    () =>
      countCRMRequests(
        requests.map((request) => ({
          status: request.status,
          dates: bookedDates(request),
        })),
        localIsoDate()
      ),
    [requests]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    const matches = requests.filter((request) => {
      const filterMatch =
        filter === "all" ||
        (filter === "today"
          ? bookedDates(request).includes(localIsoDate()) &&
            ["confirmed", "in_service", "completed", "no_show"].includes(request.status)
          : filter === "upcoming"
            ? ["confirmed", "in_service"].includes(request.status) &&
              bookedDates(request).some((date) => {
                const days = daysFromToday(date);
                return days >= 1 && days <= 7;
              })
            : filter === "in_progress"
              ? IN_PROGRESS_STATUSES.includes(request.status)
              : request.status === filter);
      if (!filterMatch) return false;
      if (!q) return true;

      const haystack = [
        request.reference,
        request.contact?.name,
        request.contact?.email,
        request.contact?.phone,
        request.external_booking_channel,
        request.external_booking_reference,
        ...request.items.map((item) => item.experience_title),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });

    if (filter === "today" || filter === "upcoming") {
      return matches.sort((a, b) => {
        const aDate = bookedDates(a).sort()[0] || "9999-12-31";
        const bDate = bookedDates(b).sort()[0] || "9999-12-31";
        if (aDate !== bDate) return aDate.localeCompare(bDate);
        const aTime = operationalRows(a)[0]?.time || "99:99";
        const bTime = operationalRows(b)[0]?.time || "99:99";
        return aTime.localeCompare(bTime);
      });
    }

    return matches;
  }, [requests, filter, query]);

  const filteredContacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;

    return contacts.filter((contact) =>
      [
        contact.name,
        contact.email,
        contact.phone,
        contact.source,
        contact.preferred_language,
        contact.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [contacts, query]);

  const contactCount = contacts.length;

  const viewTitle =
    filter === "contacts"
      ? "Contacts"
      : filter === "all"
        ? "All requests"
        : filter === "today"
          ? "Today"
          : filter === "upcoming"
            ? "Next 7 days"
            : filter === "in_progress"
          ? "In progress"
          : STATUS_LABELS[filter as CRMStatus];

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
        <form
          className="admin-login-card"
          onSubmit={otpSent ? verifyOtp : requestOtp}
        >
          <p className="eyebrow dark">PRIVATE CRM</p>
          <h1>{otpSent ? "Check your email" : "Owner login"}</h1>
          <p>
            {otpSent
              ? "Open the latest Watermelon CRM email and tap Sign in. You will return directly here. If the email shows a 6-digit code instead, enter it below."
              : isStandalone
                ? "Open the Watermelon CRM from this icon. Sign in once on this device and your session will stay saved until you sign out or the secure session is revoked."
                : "Access is restricted to the Watermelon owner account. For persistent access on iPhone, install the Watermelon CRM on the Home Screen and sign in there once."}
          </p>

          <div className="admin-owner-account">
            <span>Authorized account</span>
            <strong>c.v******1969@gmail.com</strong>
          </div>

          {otpSent && (
            <label>
              <span>6-digit code (if shown in the email)</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                required
                value={otpCode}
                onChange={(event) =>
                  setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
                autoFocus
              />
            </label>
          )}

          {message && <p className="admin-error">{message}</p>}

          <button
            className="button button-primary wide"
            type="submit"
            disabled={
              loginLoading ||
              (!otpSent && loginCooldown > 0) ||
              (otpSent && otpCode.length !== 6)
            }
          >
            {loginLoading
              ? otpSent
                ? "Checking code…"
                : "Sending code…"
              : otpSent
                ? "Enter CRM"
                : loginCooldown > 0
                  ? "New code available in " + loginCooldown + "s"
                  : "Send access code"}
          </button>

          {otpSent && (
            <button
              className="button button-ghost wide"
              type="button"
              disabled={loginLoading || loginCooldown > 0}
              onClick={() => void requestOtp()}
            >
              {loginCooldown > 0
                ? "Send another code in " + loginCooldown + "s"
                : "Send another code"}
            </button>
          )}

          <a className="button button-ghost wide" href="/">
            Back to website
          </a>
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
        <div className="admin-topbar-actions crm-utility-actions">
          <a className="button button-ghost" href="/">Website</a>
          {pushSupported && (
            <button
              className={pushEnabled ? "button button-outline" : "button button-primary"}
              type="button"
              disabled={pushBusy}
              onClick={() =>
                pushEnabled
                  ? void disablePushNotifications()
                  : void enablePushNotifications()
              }
            >
              {pushBusy ? "Notifications…" : pushEnabled ? "Alerts on" : "Enable alerts"}
            </button>
          )}
          <button className="button button-ghost" type="button" onClick={() => void loadCRM()}>
            Refresh
          </button>
          <button className="button button-ghost" type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>

      <nav className="crm-workspace-nav" aria-label="CRM main navigation">
        <button
          type="button"
          className={workspaceView === "operations" && filter === "in_progress" ? "crm-nav-active" : ""}
          onClick={() => openView("in_progress")}
          aria-current={workspaceView === "operations" && filter === "in_progress" ? "page" : undefined}
        >Dashboard</button>
        <button
          type="button"
          className={workspaceView === "operations" && filter !== "contacts" && filter !== "in_progress" ? "crm-nav-active" : ""}
          onClick={() => openView("all")}
        >Requests</button>
        <button
          type="button"
          className={workspaceView === "operations" && filter === "contacts" ? "crm-nav-active" : ""}
          onClick={() => openView("contacts")}
        >Contacts</button>
        <a href="/admin/whatsapp">WhatsApp</a>
        <a href="/admin/bookings">Bookings & payments</a>
        <a href="https://watermelon-product-studio.vercel.app/">Product Studio</a>
        <button
          type="button"
          className={workspaceView === "marketing" ? "crm-nav-active" : ""}
          aria-pressed={workspaceView === "marketing"}
          onClick={() => setWorkspaceView("marketing")}
        >Marketing & analytics</button>
        <a href="/admin/promotions">Promotions</a>
      </nav>

      {!pushEnabled && pushSupported && (
        <div className="crm-alert-setup">
          <div>
            <strong>CRM alerts are off on this device</strong>
            <span>
              {pushPermission === "denied"
                ? "Notifications are blocked for this CRM app. Allow notifications in iPhone Settings, then activate alerts again."
                : pushSupported
                  ? "Activate them once on this device. After that, the CRM keeps the subscription and restores it automatically whenever you open the app."
                  : isStandalone
                    ? "This installed CRM cannot use web push on this device."
                    : "You are viewing the CRM inside a browser that cannot keep iPhone push notifications active. Open watermelonexperiences.pt/crm in Safari, tap Share → Add to Home Screen, then use that Watermelon CRM icon."}
            </span>
          </div>

          {pushSupported && pushPermission !== "denied" && (
            <button
              className="button button-primary"
              type="button"
              disabled={pushBusy}
              onClick={() => void enablePushNotifications()}
            >
              {pushBusy ? "Activating…" : "Activate CRM alerts"}
            </button>
          )}
        </div>
      )}

      <div className="crm-stats">
        <button
          type="button"
          className={filter === "new" ? "crm-stat-active" : ""}
          aria-pressed={filter === "new"}
          onClick={() => openView("new")}
        >
          <span>New requests</span><strong>{counts.new}</strong>
        </button>
        <button
          type="button"
          className={filter === "in_progress" ? "crm-stat-active" : ""}
          aria-pressed={filter === "in_progress"}
          onClick={() => openView("in_progress")}
        >
          <span>In progress</span><strong>{counts.inReview}</strong>
        </button>
        <button
          type="button"
          className={filter === "proposal_sent" ? "crm-stat-active" : ""}
          aria-pressed={filter === "proposal_sent"}
          onClick={() => openView("proposal_sent")}
        >
          <span>Proposal sent</span><strong>{counts.proposalSent}</strong>
        </button>
        <button
          type="button"
          className={filter === "awaiting_payment" ? "crm-stat-active" : ""}
          aria-pressed={filter === "awaiting_payment"}
          onClick={() => openView("awaiting_payment")}
        >
          <span>Awaiting payment</span><strong>{counts.awaitingPayment}</strong>
        </button>
        <button
          type="button"
          className={filter === "today" ? "crm-stat-active" : ""}
          aria-pressed={filter === "today"}
          onClick={() => openView("today")}
        >
          <span>Today</span><strong>{counts.today}</strong>
        </button>
        <button
          type="button"
          className={filter === "upcoming" ? "crm-stat-active" : ""}
          aria-pressed={filter === "upcoming"}
          onClick={() => openView("upcoming")}
        >
          <span>Next 7 days</span><strong>{counts.upcoming}</strong>
        </button>
        <button
          type="button"
          className={filter === "confirmed" ? "crm-stat-active" : ""}
          aria-pressed={filter === "confirmed"}
          onClick={() => openView("confirmed")}
        >
          <span>Confirmed</span><strong>{counts.confirmed}</strong>
        </button>
        <button
          type="button"
          className={filter === "completed" ? "crm-stat-active" : ""}
          aria-pressed={filter === "completed"}
          onClick={() => openView("completed")}
        >
          <span>Completed</span><strong>{counts.completed}</strong>
        </button>
        <button
          type="button"
          className={filter === "contacts" ? "crm-stat-active" : ""}
          aria-pressed={filter === "contacts"}
          onClick={() => openView("contacts")}
        >
          <span>Contacts</span><strong>{contactCount}</strong>
        </button>
      </div>

      {workspaceView === "marketing" ? (
        <div className="crm-marketing-workspace">
          <div className="crm-workspace-heading">
            <h2>Marketing & analytics</h2>
            <p>Historical website events and Google Ads conversions are different from active CRM requests.</p>
          </div>
          <CRMMarketingPerformance />
          <CRMAnalytics />
        </div>
      ) : (
        <>
      <div className="crm-toolbar">
        <div className="admin-filters crm-filters">
          {([
            ["all", "All requests"],
            ["in_review", "In review"],
            ["awaiting_customer", "Waiting for customer"],
            ["proposal_drafting", "Drafting"],
            ["customer_replied", "Customer replied"],
            ["accepted", "Accepted"],
            ["in_service", "In service"],
            ["completed", "Completed"],
            ["no_show", "No-show"],
            ["declined", "Declined"],
            ["cancelled", "Cancelled"],
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
            placeholder={
              filter === "contacts"
                ? "Name, phone, email or source"
                : "Name, phone, email, reference or experience"
            }
          />
        </label>
      </div>

      {message && <p className="admin-error">{message}</p>}
      {loading && <p className="admin-loading">Loading CRM…</p>}

      <div className="crm-results-heading" id="crm-results">
        <div>
          <span>Showing</span>
          <h2>{viewTitle}</h2>
        </div>
        <div className="admin-topbar-actions">
          {filter === "today" && (
            <button className="button button-outline" type="button" onClick={printTodayManifest}>
              Print today manifest
            </button>
          )}
          <strong>{filter === "contacts" ? filteredContacts.length : filtered.length}</strong>
        </div>
      </div>

      {filter === "contacts" && !loading && (
        <div className="crm-contact-list">
          {filteredContacts.length === 0 && (
            <div className="admin-empty">
              <h2>No contacts found.</h2>
              <p>Try another search or wait for a new customer interaction.</p>
            </div>
          )}

          {filteredContacts.map((contact) => {
            const relatedRequests = requests.filter(
              (request) => request.contact?.id === contact.id
            );

            return (
              <article className="crm-contact-card" key={contact.id}>
                <header>
                  <div>
                    <span className="admin-reference">{contact.source || "customer"}</span>
                    <h2>{contact.name}</h2>
                    <p>Last contact {dateTime(contact.last_contact_at)}</p>
                  </div>
                  <span className="crm-contact-request-count">
                    {relatedRequests.length} request{relatedRequests.length === 1 ? "" : "s"}
                  </span>
                </header>

                <div className="crm-contact-grid">
                  <div>
                    <span>Phone / WhatsApp</span>
                    {contact.phone ? (
                      <a href={"tel:" + contact.phone}>{contact.phone}</a>
                    ) : (
                      <strong>—</strong>
                    )}
                  </div>
                  <div>
                    <span>Email</span>
                    {contact.email ? (
                      <a href={"mailto:" + contact.email}>{contact.email}</a>
                    ) : (
                      <strong>—</strong>
                    )}
                  </div>
                  <div>
                    <span>Language</span>
                    <strong>{contact.preferred_language || "—"}</strong>
                  </div>
                  <div>
                    <span>Created</span>
                    <strong>{shortDate(contact.created_at)}</strong>
                  </div>
                </div>

                {contact.notes && (
                  <div className="crm-contact-notes">
                    <strong>Notes</strong>
                    <p>{contact.notes}</p>
                  </div>
                )}

                {relatedRequests.length > 0 && (
                  <div className="crm-contact-history">
                    <strong>Request history</strong>
                    <div>
                      {relatedRequests.map((request) => (
                        <button
                          type="button"
                          key={request.id}
                          onClick={() => {
                            setFilter("all");
                            setQuery(request.reference);
                          }}
                        >
                          <span>{request.reference}</span>
                          <b>{STATUS_LABELS[request.status]}</b>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="crm-contact-actions">
                  <button
                    className="button crm-danger-button"
                    type="button"
                    disabled={editing === contact.id}
                    onClick={() =>
                      void deleteContactPermanently(contact, relatedRequests.length)
                    }
                  >
                    {editing === contact.id ? "Deleting…" : "Delete contact permanently"}
                  </button>
                  {relatedRequests.length > 0 && (
                    <span>Delete the contact's requests first.</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {filter !== "contacts" && (
        <div className="crm-request-list">
        {!loading && filtered.length === 0 && (
          <div className="admin-empty">
            <h2>No requests in {viewTitle.toLowerCase()}.</h2>
            <p>Choose another area above or wait for a new customer interaction.</p>
          </div>
        )}

        {filtered.map((request) => {
          const busy = editing === request.id;
          const first = request.items[0];
          const aiRequest = request.source === "ai_concierge";
          const aiCustomerSummary = extractAiNote(request.customer_notes, [
            "Quote notes",
            "Customer details",
          ]);
          const aiIntent = extractAiNote(request.customer_notes, ["Intent"]);
          const aiRequestedPlan = cleanAiSpecialRequest(first?.special_request);
          const latestProposal = request.proposals[0] || null;
          const canAcceptProposalRequest =
            request.kind === "personalized_proposal" &&
            ["new", "in_review", "awaiting_customer", "proposal_drafting", "proposal_sent", "customer_replied"].includes(
              request.status
            );
          const canPrepareProposalPayment =
            request.kind === "personalized_proposal" &&
            Boolean(latestProposal) &&
            latestProposal?.payment_status !== "paid" &&
            !["confirmed", "declined", "cancelled"].includes(request.status);

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

                {request.booking?.site_promotion_applied &&
                  request.booking.site_before_price !== null && (
                    <section className="crm-review-note">
                      <strong>{request.booking.site_promotion_label || "Website offer"}</strong>
                      <span>
                        Direct-site promotion applied · Before {money(request.booking.site_before_price, request.currency)} · Now {request.items[0]?.unit_price !== null && request.items[0]?.unit_price !== undefined ? money(request.items[0].unit_price, request.currency) : "—"} {request.items[0]?.pricing_mode === "group" ? "per group" : "per guest"}. Viator was not changed.
                      </span>
                    </section>
                  )}

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

                {aiRequest ? (
                  <section className="crm-ai-brief">
                    <div className="crm-ai-brief-heading">
                      <div>
                        <span>AI REQUEST SUMMARY</span>
                        <h3>What needs to be prepared</h3>
                      </div>
                      <strong>Personalized proposal</strong>
                    </div>

                    <div className="crm-ai-brief-primary">
                      <span>REQUEST</span>
                      <strong>{first?.experience_title || "Tailor-made proposal"}</strong>
                      {aiRequestedPlan && <p>{aiRequestedPlan}</p>}
                    </div>

                    <div className="crm-ai-brief-grid">
                      <div>
                        <span>Date</span>
                        <strong>{shortDate(first?.requested_date || null)}</strong>
                      </div>
                      <div>
                        <span>Group</span>
                        <strong>
                          {aiCustomerSummary ||
                            (first
                              ? first.guests + " guest" + (first.guests === 1 ? "" : "s")
                              : "Not specified")}
                        </strong>
                      </div>
                      <div>
                        <span>Action</span>
                        <strong>Prepare and send proposal</strong>
                      </div>
                    </div>

                    {(first?.pickup_location ||
                      first?.children_ages ||
                      first?.dietary ||
                      first?.accessibility ||
                      first?.occasion) && (
                      <div className="crm-ai-brief-extra">
                        {first?.pickup_location && <p><strong>Pickup:</strong> {first.pickup_location}</p>}
                        {first?.children_ages && <p><strong>Children:</strong> {first.children_ages}</p>}
                        {first?.dietary && <p><strong>Dietary:</strong> {first.dietary}</p>}
                        {first?.accessibility && <p><strong>Accessibility:</strong> {first.accessibility}</p>}
                        {first?.occasion && <p><strong>Occasion:</strong> {first.occasion}</p>}
                      </div>
                    )}

                    {(request.customer_notes || aiIntent) && (
                      <details className="crm-ai-conversation-details">
                        <summary>Conversation details</summary>
                        {aiIntent && <p><strong>Intent:</strong> {aiIntent}</p>}
                        {request.customer_notes && <p>{request.customer_notes}</p>}
                      </details>
                    )}
                  </section>
                ) : (
                  (request.customer_notes ||
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
                  )
                )}

                {request.kind === "personalized_proposal" && (
                  <ProposalEditor
                    request={request}
                    onChanged={loadCRM}
                  />
                )}

                {request.kind === "direct_booking" &&
                  !["accepted", "awaiting_payment", "confirmed", "declined", "cancelled"].includes(request.status) && (
                    <section className="crm-review-note">
                      <strong>Request still under review</strong>
                      <span>
                        You can ask the customer questions and continue by WhatsApp or email as long as needed. Nothing is accepted and no payment is requested until you choose <b>Accept booking request</b>.
                      </span>
                    </section>
                  )}

                {["accepted", "awaiting_payment", "confirmed", "in_service", "completed", "no_show", "cancelled"].includes(request.status) && (
                  <section className="crm-review-note">
                    <strong>Booking operations</strong>
                    <span>
                      {request.external_booking_reference
                        ? (request.external_booking_channel || "External") + " · " + request.external_booking_reference
                        : "No external supplier/channel reference recorded."}
                    </span>
                    {request.admin_notes && (
                      <small><strong>Internal note:</strong> {request.admin_notes}</small>
                    )}
                    <div className="admin-topbar-actions">
                      <button
                        className="button button-ghost"
                        type="button"
                        disabled={busy}
                        onClick={() => void saveInternalNote(request)}
                      >
                        {request.admin_notes ? "Edit internal note" : "Add internal note"}
                      </button>
                      <button
                        className="button button-ghost"
                        type="button"
                        disabled={busy}
                        onClick={() => void saveExternalBookingReference(request)}
                      >
                        {request.external_booking_reference ? "Edit external reference" : "Add external reference"}
                      </button>

                      {request.status === "confirmed" && (
                        <>
                          {request.contact?.phone && (
                            <>
                              <button
                                className="button button-outline"
                                type="button"
                                disabled={busy}
                                onClick={() => openWhatsAppOperationalMessage(request, "confirmation")}
                              >
                                Send confirmation
                              </button>
                              <button
                                className="button button-outline"
                                type="button"
                                disabled={busy}
                                onClick={() => openWhatsAppOperationalMessage(request, "reminder")}
                              >
                                Send trip reminder
                              </button>
                            </>
                          )}
                          <button
                            className="button button-primary"
                            type="button"
                            disabled={busy}
                            onClick={() => void setOperationalStatus(request, "in_service")}
                          >
                            Check-in / start
                          </button>
                          <button
                            className="button button-outline"
                            type="button"
                            disabled={busy}
                            onClick={() => void setOperationalStatus(request, "completed")}
                          >
                            Complete directly
                          </button>
                          <button
                            className="button button-ghost"
                            type="button"
                            disabled={busy}
                            onClick={() => void setOperationalStatus(request, "no_show")}
                          >
                            No-show
                          </button>
                        </>
                      )}

                      {request.status === "in_service" && (
                        <>
                          <button
                            className="button button-primary"
                            type="button"
                            disabled={busy}
                            onClick={() => void setOperationalStatus(request, "completed")}
                          >
                            Mark completed
                          </button>
                          <button
                            className="button button-ghost"
                            type="button"
                            disabled={busy}
                            onClick={() => void setOperationalStatus(request, "no_show")}
                          >
                            No-show
                          </button>
                        </>
                      )}

                      {request.status === "completed" && request.contact?.phone && (
                        <button
                          className="button button-outline"
                          type="button"
                          disabled={busy}
                          onClick={() => void requestTripadvisorReview(request)}
                        >
                          {request.review_requested_at ? "Send review request again" : "Ask for Tripadvisor review"}
                        </button>
                      )}

                      {["accepted", "awaiting_payment", "confirmed", "in_service"].includes(request.status) && (
                        <button
                          className="button button-ghost"
                          type="button"
                          disabled={busy}
                          onClick={() => void cancelBooking(request)}
                        >
                          Cancel booking
                        </button>
                      )}

                      {request.status === "cancelled" &&
                        paymentStatusForRequest(request) === "paid" && (
                          <button
                            className="button button-outline"
                            type="button"
                            disabled={busy}
                            onClick={() => void markRefunded(request)}
                          >
                            Mark refund completed
                          </button>
                        )}
                    </div>
                    {request.review_requested_at && request.status === "completed" && (
                      <small>Review request prepared {dateTime(request.review_requested_at)}.</small>
                    )}
                    {request.status === "cancelled" &&
                      paymentStatusForRequest(request) === "refunded" && (
                        <small>Refund recorded.</small>
                      )}
                  </section>
                )}

                {request.contact?.phone && (
                  <WhatsAppConversation
                    request={request}
                    onChanged={() => void loadCRM()}
                  />
                )}

                {request.contact?.email && (
                  <EmailConversation
                    request={request}
                    onChanged={() => void loadCRM()}
                  />
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

                {request.kind === "direct_booking" &&
                  ["new", "in_review", "awaiting_customer", "customer_replied"].includes(request.status) && (
                    <button
                      className="button button-primary"
                      type="button"
                      disabled={busy}
                      onClick={() => void acceptDirectBooking(request)}
                    >
                      Accept booking request
                    </button>
                  )}

                {request.kind === "direct_booking" && request.status === "accepted" && (
                  <button
                    className="button button-primary"
                    type="button"
                    disabled={busy}
                    onClick={() => void prepareDirectBookingPayment(request)}
                  >
                    Send payment options
                  </button>
                )}

                {request.kind === "direct_booking" && request.status === "awaiting_payment" && (
                  <button
                    className="button button-primary"
                    type="button"
                    disabled={busy}
                    onClick={() => void markDirectBookingPaid(request)}
                  >
                    Mark payment received
                  </button>
                )}

                {canAcceptProposalRequest && (
                  <button
                    className="button button-primary"
                    type="button"
                    disabled={busy}
                    onClick={() => void acceptProposalRequest(request, false)}
                  >
                    Accept request
                  </button>
                )}

                {canAcceptProposalRequest && latestProposal && (
                  <button
                    className="button button-outline"
                    type="button"
                    disabled={busy}
                    onClick={() => void acceptProposalRequest(request, true)}
                  >
                    Accept + payment link
                  </button>
                )}

                {!canAcceptProposalRequest &&
                  canPrepareProposalPayment &&
                  request.status !== "awaiting_payment" && (
                    <button
                      className="button button-primary"
                      type="button"
                      disabled={busy}
                      onClick={() => void acceptProposalRequest(request, true)}
                    >
                      Send payment link
                    </button>
                  )}

                {request.kind === "personalized_proposal" &&
                  request.status === "awaiting_payment" &&
                  latestProposal?.payment_token && (
                    <button
                      className="button button-outline"
                      type="button"
                      disabled={busy}
                      onClick={() => void resendPaymentLink(request)}
                    >
                      Resend payment link
                    </button>
                  )}

                {request.kind !== "direct_booking" &&
                  !["confirmed", "in_service", "completed", "no_show", "declined", "cancelled"].includes(request.status) && (
                    <button
                      className="button button-ghost"
                      type="button"
                      disabled={busy}
                      onClick={() => void changeStatus(request, "declined")}
                    >
                      Decline
                    </button>
                  )}

                {request.kind === "direct_booking" &&
                  ["new", "in_review", "awaiting_customer", "customer_replied"].includes(request.status) && (
                    <button
                      className="button button-ghost"
                      type="button"
                      disabled={busy}
                      onClick={() => void declineDirectBooking(request)}
                    >
                      Decline
                    </button>
                  )}

                <button
                  className="button"
                  type="button"
                  disabled={busy}
                  onClick={() => void deleteRequestPermanently(request)}
                  style={{
                    marginLeft: "auto",
                    border: "1px solid #b42318",
                    color: "#b42318",
                    background: "#fff",
                  }}
                >
                  Delete permanently
                </button>
              </footer>
            </article>
          );
        })}
        </div>
      )}
        </>
      )}
    </section>
  );
}
