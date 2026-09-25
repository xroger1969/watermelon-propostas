"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SetupStatus = {
  verify_token: string;
  phone_number_id: string | null;
  waba_id: string | null;
  business_phone: string | null;
  graph_version: string;
  has_app_secret: boolean;
  has_access_token: boolean;
  webhook_verified_at: string | null;
  last_webhook_at: string | null;
  last_error: string | null;
};

const CALLBACK_URL =
  "https://bwujfaptrrkshxarzbid.supabase.co/functions/v1/watermelon-whatsapp-webhook";

function dateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function WhatsAppSetup() {
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [appSecret, setAppSecret] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [graphVersion, setGraphVersion] = useState("v23.0");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");
    const { data, error } = await supabase.rpc("watermelon_whatsapp_admin_status");
    if (error || !data) {
      setMessage(error?.message || "Unable to load WhatsApp settings.");
      setLoading(false);
      return;
    }

    const next = data as SetupStatus;
    setStatus(next);
    setPhoneNumberId(next.phone_number_id || "");
    setWabaId(next.waba_id || "");
    setBusinessPhone(next.business_phone || "");
    setGraphVersion(next.graph_version || "v23.0");
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    setSaving(true);
    setMessage("");

    const { data, error } = await supabase.rpc("watermelon_save_whatsapp_config", {
      p_app_secret: appSecret.trim() || null,
      p_access_token: accessToken.trim() || null,
      p_phone_number_id: phoneNumberId.trim() || null,
      p_waba_id: wabaId.trim() || null,
      p_business_phone: businessPhone.trim() || null,
      p_graph_version: graphVersion.trim() || "v23.0",
    });

    if (error || !data) {
      setMessage(error?.message || "Unable to save WhatsApp settings.");
      setSaving(false);
      return;
    }

    setStatus(data as SetupStatus);
    setAppSecret("");
    setAccessToken("");
    setMessage("WhatsApp settings saved.");
    setSaving(false);
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setMessage("Could not copy to the clipboard.");
    }
  }

  const ready = Boolean(
    status?.has_app_secret &&
      status?.has_access_token &&
      status?.phone_number_id &&
      status?.waba_id
  );

  return (
    <section className="admin-shell whatsapp-setup-shell">
      <div className="admin-topbar">
        <div>
          <p className="eyebrow dark">WATERMELON PRIVATE AREA</p>
          <h1>WhatsApp CRM</h1>
          <p className="crm-topbar-copy">
            Connect Meta WhatsApp Business Platform so customer replies enter the CRM automatically.
          </p>
        </div>
        <div className="admin-topbar-actions">
          <a className="button button-ghost" href="/admin">CRM</a>
          <button className="button button-ghost" type="button" onClick={() => void load()}>
            Refresh status
          </button>
        </div>
      </div>

      {loading ? (
        <p className="admin-loading">Loading WhatsApp setup…</p>
      ) : (
        <>
          <div className="whatsapp-setup-status">
            <div>
              <span>Credentials</span>
              <strong>{ready ? "Configured" : "Incomplete"}</strong>
            </div>
            <div>
              <span>Webhook</span>
              <strong>{status?.webhook_verified_at ? "Verified" : "Not verified yet"}</strong>
            </div>
            <div>
              <span>Last webhook</span>
              <strong>{dateTime(status?.last_webhook_at || null)}</strong>
            </div>
          </div>

          {status?.last_error && (
            <p className="admin-error">Last webhook error: {status.last_error}</p>
          )}

          <article className="whatsapp-setup-card">
            <div className="whatsapp-setup-heading">
              <div>
                <p className="eyebrow dark">META WEBHOOK</p>
                <h2>1. Connect the webhook in Meta</h2>
                <p>
                  Add this callback URL and verify token in your Meta app under WhatsApp → Configuration.
                </p>
              </div>
            </div>

            <div className="whatsapp-copy-field">
              <span>Callback URL</span>
              <code>{CALLBACK_URL}</code>
              <button type="button" onClick={() => void copy(CALLBACK_URL, "callback")}>
                {copied === "callback" ? "Copied ✓" : "Copy"}
              </button>
            </div>

            <div className="whatsapp-copy-field">
              <span>Verify token</span>
              <code>{status?.verify_token || "—"}</code>
              <button
                type="button"
                onClick={() => void copy(status?.verify_token || "", "verify")}
                disabled={!status?.verify_token}
              >
                {copied === "verify" ? "Copied ✓" : "Copy"}
              </button>
            </div>

            <p className="whatsapp-setup-note">
              Subscribe the app to the <strong>messages</strong> webhook field and to the WhatsApp Business Account.
            </p>
          </article>

          <article className="whatsapp-setup-card">
            <div className="whatsapp-setup-heading">
              <div>
                <p className="eyebrow dark">CLOUD API</p>
                <h2>2. Save the WhatsApp Business details</h2>
                <p>
                  Secrets stay on the server. Leave a secret field blank later if you do not want to replace its saved value.
                </p>
              </div>
            </div>

            <div className="whatsapp-setup-grid">
              <label>
                <span>Phone Number ID</span>
                <input
                  value={phoneNumberId}
                  onChange={(event) => setPhoneNumberId(event.target.value)}
                  placeholder="Example: 123456789012345"
                />
              </label>

              <label>
                <span>WhatsApp Business Account ID (WABA)</span>
                <input
                  value={wabaId}
                  onChange={(event) => setWabaId(event.target.value)}
                  placeholder="Example: 123456789012345"
                />
              </label>

              <label>
                <span>Business WhatsApp number</span>
                <input
                  value={businessPhone}
                  onChange={(event) => setBusinessPhone(event.target.value)}
                  placeholder="+351..."
                />
              </label>

              <label>
                <span>Graph API version</span>
                <input
                  value={graphVersion}
                  onChange={(event) => setGraphVersion(event.target.value)}
                  placeholder="v23.0"
                />
              </label>

              <label className="whatsapp-secret-field">
                <span>Meta App Secret {status?.has_app_secret ? "· saved ✓" : ""}</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={appSecret}
                  onChange={(event) => setAppSecret(event.target.value)}
                  placeholder={status?.has_app_secret ? "Leave blank to keep current secret" : "Paste App Secret"}
                />
              </label>

              <label className="whatsapp-secret-field">
                <span>Permanent/System User Access Token {status?.has_access_token ? "· saved ✓" : ""}</span>
                <textarea
                  rows={3}
                  value={accessToken}
                  onChange={(event) => setAccessToken(event.target.value)}
                  placeholder={status?.has_access_token ? "Leave blank to keep current token" : "Paste access token"}
                />
              </label>
            </div>

            {message && (
              <p className={message.toLowerCase().includes("unable") ? "admin-error" : "crm-proposal-feedback"}>
                {message}
              </p>
            )}

            <div className="whatsapp-setup-actions">
              <button
                className="button button-primary"
                type="button"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? "Saving…" : "Save WhatsApp settings"}
              </button>
              <a
                className="button button-outline"
                href="https://developers.facebook.com/apps/"
                target="_blank"
                rel="noreferrer"
              >
                Open Meta Developers
              </a>
            </div>
          </article>

          <article className="whatsapp-setup-card">
            <div className="whatsapp-setup-heading">
              <div>
                <p className="eyebrow dark">WHAT HAPPENS NEXT</p>
                <h2>3. CRM conversation sync</h2>
              </div>
            </div>
            <div className="whatsapp-flow-list">
              <span>Customer sends WhatsApp → message appears automatically in the correct CRM request.</span>
              <span>CRM changes Waiting for customer → Customer replied automatically.</span>
              <span>You reply directly from the CRM during the Meta customer-service window.</span>
              <span>Delivery/read status is synchronized back to the CRM when Meta sends it.</span>
            </div>
          </article>
        </>
      )}
    </section>
  );
}
