"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PrivateAreaNav from "@/components/PrivateAreaNav";

const WATERMELON_BUSINESS_NUMBER = "+351 965 637 736";
const WATERMELON_BUSINESS_DIGITS = "351965637736";
const LEGACY_PHONE_ID = "874910289048462";
function phoneDigits(value: unknown) { return String(value || "").replace(/\D/g, ""); }

type WhatsAppTemplate = {
  id: string | null;
  name: string;
  status: string;
  category: string;
  language: string;
};

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
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState("");
  const [metaCode, setMetaCode] = useState("");
  const [metaWabaId, setMetaWabaId] = useState("");
  const [metaRedirectUri, setMetaRedirectUri] = useState("");
  const [coexistenceBusy, setCoexistenceBusy] = useState(false);
  const [coexistenceMessage, setCoexistenceMessage] = useState("");
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateName, setTemplateName] = useState("watermelon_app_review_test");
  const [templateBody, setTemplateBody] = useState(
    "We received your request and will contact you shortly. Thank you for choosing Watermelon Experiences."
  );

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
    if (phoneDigits(next.business_phone) === WATERMELON_BUSINESS_DIGITS && next.phone_number_id !== LEGACY_PHONE_ID) {
      void loadTemplates();
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function connectCoexistence() {
    const code = metaCode.trim();
    const redirect_uri = metaRedirectUri.trim();
    const waba_id = metaWabaId.trim();
    if (!code || !redirect_uri || !/^\d{10,25}$/.test(waba_id)) {
      setCoexistenceMessage("Introduce o código novo, o redirect URI exato e o WABA ID do número Watermelon.");
      return;
    }
    if (!window.confirm(
      "Confirmas que este código Meta é para o WhatsApp Business do número +351 965 637 736? O número pessoal +351 918 404 101 NUNCA será ligado ao CRM."
    )) return;
    setCoexistenceBusy(true);
    setCoexistenceMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("watermelon-whatsapp-coexistence", {
        method: "POST",
        body: { code, redirect_uri, waba_id },
      });
      if (error) throw new Error("Request failed. Check authentication and try a fresh code.");
      if (!data?.ok) throw new Error(String(data?.error || "Meta connection could not be completed."));
      setMetaCode("");
      setMetaRedirectUri("");
      setMetaWabaId("");
      setCoexistenceMessage("Autorização e subscrição Meta confirmadas para o número Watermelon. Os envios e a receção no CRM continuam pausados até aos testes controlados.");
      await load();
    } catch (error) {
      setCoexistenceMessage(error instanceof Error ? error.message : "Connection could not be completed.");
    } finally {
      setCoexistenceBusy(false);
    }
  }

  async function loadTemplates() {
    setTemplatesLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "watermelon-whatsapp-templates",
        { method: "GET" }
      );

      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      setTemplates(Array.isArray(data?.templates) ? data.templates : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load WhatsApp templates.");
    } finally {
      setTemplatesLoading(false);
    }
  }

  async function createTemplate() {
    if (phoneDigits(status?.business_phone) !== WATERMELON_BUSINESS_DIGITS || status?.phone_number_id === LEGACY_PHONE_ID) {
      setMessage("Templates bloqueados até ligar o número empresarial Watermelon. A conta pessoal nunca pode ser usada.");
      return;
    }
    const name = templateName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");

    if (name.length < 3 || templateBody.trim().length < 10) {
      setMessage("Add a valid template name and message.");
      return;
    }

    setTemplateBusy(true);
    setMessage("");

    try {
      const { data, error } = await supabase.functions.invoke(
        "watermelon-whatsapp-templates",
        {
          body: {
            name,
            language: "en_US",
            category: "UTILITY",
            body: templateBody.trim(),
          },
        }
      );

      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));

      setMessage(
        "Template " + name + " created in Meta. Status: " +
          String(data?.template?.status || "PENDING") + "."
      );
      await loadTemplates();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create WhatsApp template.");
    } finally {
      setTemplateBusy(false);
    }
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

  const isDedicated = phoneDigits(status?.business_phone) === WATERMELON_BUSINESS_DIGITS &&
    status?.phone_number_id !== LEGACY_PHONE_ID;
  const ready = Boolean(
    isDedicated && status?.has_app_secret &&
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
          <button className="button button-ghost" type="button" onClick={() => void load()}>
            Refresh status
          </button>
        </div>
      </div>
      <PrivateAreaNav active="whatsapp" />

      {loading ? (
        <p className="admin-loading">Loading WhatsApp setup…</p>
      ) : (
        <>
          <p className="admin-error" role="status">
            Integração WhatsApp CRM pausada por segurança. Número pessoal +351 918 404 101 excluído.
            O único número autorizado para a Watermelon é {WATERMELON_BUSINESS_NUMBER}.
            A receção e o envio automáticos só serão retomados após validação da Meta e testes reais.
          </p>
          <div className="whatsapp-setup-status">
            <div>
              <span>Credentials</span>
              <strong>{ready ? "Novo número validado (envio pausado)" : isDedicated ? "Incompleto" : "Número pessoal antigo isolado"}</strong>
            </div>
            <div>
              <span>{isDedicated ? "Webhook" : "Webhook anterior"}</span>
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
                <p className="eyebrow dark">META · BUSINESS APP COEXISTENCE</p>
                <h2>Ligar WhatsApp Business Watermelon ({WATERMELON_BUSINESS_NUMBER})</h2>
                <p>
                  Usa exclusivamente o novo número MEO no Embedded Signup da Meta, no modo WhatsApp Business App Coexistence.
                  Introduz um código de autorização <strong>novo e de utilização única</strong>, o <strong>redirect_uri</strong> exato
                  e o WABA ID devolvido pela Meta para esta ligação.
                  O servidor valida que o número associado é o {WATERMELON_BUSINESS_NUMBER} antes de substituir a configuração antiga.
                  Nunca cole tokens ou códigos nesta conversa.
                </p>
              </div>
            </div>
            <div className="whatsapp-setup-grid">
              <label>
                <span>WABA ID da ligação Watermelon (obtido na Meta)</span>
                <input inputMode="numeric" autoComplete="off" value={metaWabaId} onChange={(event) => setMetaWabaId(event.target.value)} placeholder="ID da WhatsApp Business Account" />
              </label>
              <label className="whatsapp-secret-field">
                <span>New authorization code (never share it in chat)</span>
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={metaCode}
                  onChange={(event) => setMetaCode(event.target.value)}
                  placeholder="Paste the fresh ES Response Code"
                />
              </label>
              <label className="whatsapp-secret-field">
                <span>Exact Meta redirect_uri</span>
                <input
                  type="url"
                  autoComplete="off"
                  spellCheck={false}
                  value={metaRedirectUri}
                  onChange={(event) => setMetaRedirectUri(event.target.value)}
                  placeholder="https://developers.facebook.com/es/oauth/callback/?..."
                />
              </label>
            </div>
            <p className="whatsapp-setup-note">
              No phone registration, deregistration or migration will be performed.
              The code is exchanged server-side; no access token is returned to the browser.
              Message delivery must be tested separately.
            </p>
            {coexistenceMessage && <p role="status">{coexistenceMessage}</p>}
            <div className="whatsapp-setup-actions">
              <button
                className="button button-primary"
                type="button"
                disabled={coexistenceBusy || !metaCode.trim() || !metaRedirectUri.trim() || !/^\d{10,25}$/.test(metaWabaId.trim())}
                onClick={() => void connectCoexistence()}
              >
                {coexistenceBusy ? "A validar na Meta…" : "Validar e ligar o número Watermelon"}
              </button>
            </div>
          </article>

          <article className="whatsapp-setup-card">
            <div className="whatsapp-setup-heading">
              <div>
                <p className="eyebrow dark">META APP REVIEW</p>
                <h2>3. Templates de mensagens (apenas número Watermelon)</h2>
                <p>
                  Manage a WhatsApp message template directly from Watermelon CRM. This demonstrates the
                  <strong> whatsapp_business_management</strong> permission during Meta App Review.
                </p>
              </div>
              <button
                className="button button-ghost"
                type="button"
                disabled={templatesLoading}
                onClick={() => void loadTemplates()}
              >
                {templatesLoading ? "Loading…" : "Refresh templates"}
              </button>
            </div>

            <div className="whatsapp-setup-grid">
              <label>
                <span>Template name</span>
                <input
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                  placeholder="watermelon_app_review_test"
                />
              </label>

              <label className="whatsapp-secret-field">
                <span>Template message</span>
                <textarea
                  rows={3}
                  value={templateBody}
                  onChange={(event) => setTemplateBody(event.target.value)}
                />
              </label>
            </div>

            <div className="whatsapp-setup-actions">
              <button
                className="button button-primary"
                type="button"
                disabled={templateBusy || !ready}
                onClick={() => void createTemplate()}
              >
                {templateBusy ? "Creating…" : "Create template in Meta"}
              </button>
            </div>

            <div className="whatsapp-flow-list">
              {templates.length === 0 && !templatesLoading && (
                <span>No templates returned yet.</span>
              )}
              {templates.slice(0, 8).map((template) => (
                <span key={template.id || template.name}>
                  <strong>{template.name}</strong>
                  {" · "}{template.status || "UNKNOWN"}
                  {" · "}{template.category || "—"}
                  {" · "}{template.language || "—"}
                </span>
              ))}
            </div>
          </article>

          <article className="whatsapp-setup-card">
            <div className="whatsapp-setup-heading">
              <div>
                <p className="eyebrow dark">WHAT HAPPENS NEXT</p>
                <h2>4. CRM conversation sync</h2>
              </div>
            </div>
            <div className="whatsapp-flow-list">
              <span>Depois da ativação validada: mensagens recebidas no +351 965 637 736 serão associadas ao pedido comercial correto.</span>
              <span>Nunca importar conversas nem contactos do WhatsApp pessoal 918 404 101.</span>
              <span>Os envios a partir do CRM mantêm-se bloqueados até aos testes controlados com a Meta.</span>
              <span>Delivery/read status is synchronized back to the CRM when Meta sends it.</span>
            </div>
          </article>
        </>
      )}
    </section>
  );
}
