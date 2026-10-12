"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getAdsReportState, type AdsReportStatus } from "@/lib/google-ads-report";
import styles from "./CRMMarketingPerformance.module.css";

type PeriodMetrics = {
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  ctr: number;
  cpc: number;
  cpl: number;
  roas: number;
};

type Campaign = {
  campaignId: string;
  name: string;
  status: string;
  budgetAmount: number | null;
  budgetType: string | null;
  startDate: string | null;
  endDate: string | null;
  biddingStrategy: string | null;
  campaignType: string | null;
  primaryStatus: string | null;
  primaryStatusReasons: string[];
  urlTags: string | null;
  syncedAt: string;
};

type MarketingSummary = {
  today: PeriodMetrics;
  last7: PeriodMetrics;
  previous7: {
    cost: number;
    clicks: number;
    conversions: number;
  };
  last30: PeriodMetrics;
  siteAttributed: {
    last7: { visitors: number; leads: number };
    last30: { visitors: number; leads: number };
  };
  lastSyncedAt: string | null;
  reportStatus?: AdsReportStatus;
  campaigns: Campaign[];
};

type PeriodKey = "today" | "last7" | "last30";

const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Today",
  last7: "7 days",
  last30: "30 days",
};

function number(value: number) {
  return new Intl.NumberFormat("en-GB").format(Number(value || 0));
}

function money(value: number) {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function decimal(value: number, digits = 1) {
  return Number(value || 0).toFixed(digits);
}

function dateLabel(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value.length === 10 ? value + "T00:00:00" : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(parsed);
}

function syncLabel(value: string | null) {
  if (!value) return "No report imported";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon",
  }).format(new Date(value));
}

function statusCopy(campaign: Campaign) {
  const reasons = campaign.primaryStatusReasons || [];
  if (reasons.includes("BIDDING_STRATEGY_LEARNING")) return "Learning";
  if (campaign.primaryStatus === "LIMITED") return "Limited";
  if (campaign.status === "ENABLED") return "Enabled";
  return campaign.status || "Unknown";
}

function trend(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? "New activity" : "No change";
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < 0.5) return "0%";
  return `${change > 0 ? "↑" : "↓"} ${Math.abs(change).toFixed(0)}%`;
}

export default function CRMMarketingPerformance() {
  const [summary, setSummary] = useState<MarketingSummary | null>(null);
  const [period, setPeriod] = useState<PeriodKey>("last30");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [setupMessage, setSetupMessage] = useState("");
  const [copying, setCopying] = useState(false);

  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  }, []);

  const load = useCallback(async () => {
    if (!supabase) {
      setError("Marketing data connection is not configured. Please contact support.");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error: queryError } = await supabase.rpc(
        "watermelon_marketing_summary"
      );
      if (queryError) throw queryError;
      if (!data || typeof data !== "object" || !("last30" in data)) {
        throw new Error("Invalid marketing summary response");
      }
      setSummary(data as MarketingSummary);
      setError("");
    } catch (cause) {
      console.error("Marketing metrics refresh failed", cause);
      setError(
        "Could not reload the saved report. Previously loaded results are shown below, if available. Check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function copySyncScript() {
    if (!supabase) return;
    setCopying(true);
    setSetupMessage("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Sign in to the CRM first.");
      const response = await fetch("/api/google-ads-sync", {
        headers: { Authorization: "Bearer " + data.session.access_token }, cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok || typeof payload.script !== "string") throw new Error(payload.error || "Could not load the script.");
      await navigator.clipboard.writeText(payload.script);
      setSetupMessage("Script copied. Paste it into Google Ads Scripts, authorize it, run it once and schedule it hourly.");
    } catch (cause) {
      setSetupMessage(cause instanceof Error ? cause.message : "Could not copy the setup script.");
    } finally {
      setCopying(false);
    }
  }

  const metrics = summary?.[period] || null;
  const activeCampaign = summary?.campaigns?.[0] || null;
  const siteAttributed =
    period === "last7"
      ? summary?.siteAttributed.last7
      : period === "last30"
        ? summary?.siteAttributed.last30
        : null;

  const reportState = getAdsReportState(summary?.reportStatus, period, summary?.lastSyncedAt || null);
  const showMetrics = reportState.hasReport;

  return (
    <section className={styles.panel} aria-label="Google Ads marketing performance">
      <div className={styles.header}>
        <div>
          <p className={styles.kicker}>MARKETING PERFORMANCE</p>
          <h2>Google Ads + website results</h2>
          <p>
            Paid-media performance from Google Ads, combined with Watermelon
            first-party website attribution.
          </p>
        </div>

        <div className={styles.headerActions}>
          <div className={styles.periods} aria-label="Marketing period">
            {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((key) => (
              <button
                key={key}
                type="button"
                className={period === key ? styles.periodActive : ""}
                aria-pressed={period === key}
                onClick={() => setPeriod(key)}
              >
                {PERIOD_LABELS[key]}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.refresh}
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? "Reloading…" : "Reload report"}
          </button>
        </div>
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}

      {summary && (reportState.stale || reportState.incomplete || !reportState.automatic) && (
        <div className={styles.waiting} role="status">
          <strong>{reportState.stale ? "Google Ads report is out of date" : "Google Ads report coverage"}</strong>
          <span>
            {summary.reportStatus?.latestReportDate
              ? "Latest report covers up to " + dateLabel(summary.reportStatus.latestReportDate) + ". "
              : "Report coverage has not been confirmed. "}
            {!reportState.automatic
              ? "Automatic imports have not started. Authorize the report script in Google Ads to activate them. "
              : reportState.stale ? "The scheduled import has stopped or is delayed. Check the script in Google Ads. " : ""}
            Reload report reads the saved data.
          </span>
        </div>
      )}

      {activeCampaign && (
        <div className={styles.campaign}>
          <div>
            <span className={styles.campaignLabel}>CURRENT CAMPAIGN</span>
            <strong>{activeCampaign.name}</strong>
            <small>
              {activeCampaign.campaignType === "PERFORMANCE_MAX"
                ? "Performance Max"
                : activeCampaign.campaignType || "Google Ads"}
              {" · "}
              {activeCampaign.biddingStrategy === "MAXIMIZE_CONVERSIONS"
                ? "Maximize conversions"
                : activeCampaign.biddingStrategy || "Automatic bidding"}
            </small>
          </div>
          <div className={styles.campaignFacts}>
            <span className={styles.statusPill}>{statusCopy(activeCampaign)}</span>
            <span>
              <b>{money(Number(activeCampaign.budgetAmount || 0))}</b>/day
            </span>
            <span>
              {dateLabel(activeCampaign.startDate)} → {dateLabel(activeCampaign.endDate)}
            </span>
          </div>
        </div>
      )}

      {metrics && (
        <>
          <div className={styles.metrics}>
            <article>
              <span>Spend</span>
              <strong>{showMetrics ? money(metrics.cost) : "—"}</strong>
              {period === "last7" && summary && showMetrics && !reportState.incomplete &&
                summary.reportStatus?.coverage.previous7?.reportedDays === 7 && (
                <small>{trend(metrics.cost, summary.previous7.cost)} vs prior 7 days</small>
              )}
            </article>
            <article>
              <span>Impressions</span>
              <strong>{showMetrics ? number(metrics.impressions) : "—"}</strong>
              <small>CTR {showMetrics && metrics.impressions > 0 ? decimal(metrics.ctr, 2) + "%" : "—"}</small>
            </article>
            <article>
              <span>Clicks</span>
              <strong>{showMetrics ? number(metrics.clicks) : "—"}</strong>
              <small>CPC {showMetrics && metrics.clicks > 0 ? money(metrics.cpc) : "—"}</small>
            </article>
            <article>
              <span>Google conversions</span>
              <strong>{showMetrics ? decimal(metrics.conversions, 1) : "—"}</strong>
              <small>Cost / conversion {showMetrics && metrics.conversions > 0 ? money(metrics.cpl) : "—"}</small>
            </article>
            <article>
              <span>Conversion value</span>
              <strong>{showMetrics ? money(metrics.conversionValue) : "—"}</strong>
              <small>Google Ads attributed value</small>
            </article>
            <article>
              <span>ROAS</span>
              <strong>{showMetrics && metrics.cost > 0 ? decimal(metrics.roas, 2) + "×" : "—"}</strong>
              <small>Conversion value ÷ spend</small>
            </article>
          </div>

          {(!showMetrics || reportState.incomplete) && (
            <div className={styles.waiting}>
              <strong>{showMetrics ? "Partial totals for this period" : "Report not received for this period"}</strong>
              <span>
                {showMetrics
                  ? "The totals include only imported days. Missing dates are not counted as zero activity."
                  : "No report was imported for the selected dates. Spend, clicks and conversions are unknown until the report arrives."}
              </span>
            </div>
          )}

          {siteAttributed && (
            <div className={styles.siteBridge}>
              <div>
                <span>Google CPC visitors on Watermelon</span>
                <strong>{number(siteAttributed.visitors)}</strong>
              </div>
              <div>
                <span>Website lead events attributed to Google CPC</span>
                <strong>{number(siteAttributed.leads)}</strong>
              </div>
              <p>
                Only consented visits with verifiable Google CPC attribution appear here.
                This count can be lower than Google Ads clicks; zero does not mean zero visits.
              </p>
            </div>
          )}
        </>
      )}

      {summary && (
        <details className={styles.syncSetup}>
          <summary>Set up automatic reports</summary>
          <p>In Google Ads, open Tools → Bulk actions → Scripts. Add this report script, authorize it, run it once and schedule it hourly.</p>
          <button type="button" className={styles.refresh} onClick={() => void copySyncScript()} disabled={copying}>
            {copying ? "Copying…" : "Copy setup script"}
          </button>
          {setupMessage && <p role="status">{setupMessage}</p>}
        </details>
      )}

      {!summary && loading && (
        <p className={styles.loading}>Loading Google Ads performance…</p>
      )}

      <div className={styles.footer}>
        <span>
          Google Ads account: <strong>Watermelon Experiences</strong>
        </span>
        <span>
          {summary?.lastSyncedAt
            ? "Report imported " + syncLabel(summary.lastSyncedAt) + " (Lisbon)"
            : "Metrics will populate on the first Google Ads data sync"}
        </span>
      </div>
    </section>
  );
}
