"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
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

function statusCopy(campaign: Campaign) {
  const reasons = campaign.primaryStatusReasons || [];
  if (reasons.includes("BIDDING_STRATEGY_LEARNING")) return "Learning";
  if (campaign.primaryStatus === "LIMITED") return "Limited";
  if (campaign.status === "ENABLED") return "Active";
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

  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  }, []);

  const load = useCallback(async () => {
    if (!supabase) return;

    setLoading(true);
    setError("");

    const { data, error: queryError } = await supabase.rpc(
      "watermelon_marketing_summary"
    );

    if (queryError) {
      setError(queryError.message);
    } else {
      setSummary(data as MarketingSummary);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60000);
    return () => window.clearInterval(timer);
  }, [load]);

  const metrics = summary?.[period] || null;
  const activeCampaign = summary?.campaigns?.[0] || null;
  const siteAttributed =
    period === "last7"
      ? summary?.siteAttributed.last7
      : period === "last30"
        ? summary?.siteAttributed.last30
        : null;

  const hasAdsData =
    Boolean(metrics) &&
    (Number(metrics?.impressions || 0) > 0 ||
      Number(metrics?.clicks || 0) > 0 ||
      Number(metrics?.cost || 0) > 0);

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
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

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
              <strong>{money(metrics.cost)}</strong>
              {period === "last7" && summary && (
                <small>{trend(metrics.cost, summary.previous7.cost)} vs prior 7 days</small>
              )}
            </article>
            <article>
              <span>Impressions</span>
              <strong>{number(metrics.impressions)}</strong>
              <small>CTR {decimal(metrics.ctr, 2)}%</small>
            </article>
            <article>
              <span>Clicks</span>
              <strong>{number(metrics.clicks)}</strong>
              <small>CPC {money(metrics.cpc)}</small>
            </article>
            <article>
              <span>Google conversions</span>
              <strong>{decimal(metrics.conversions, 1)}</strong>
              <small>Cost / conversion {money(metrics.cpl)}</small>
            </article>
            <article>
              <span>Conversion value</span>
              <strong>{money(metrics.conversionValue)}</strong>
              <small>Google Ads attributed value</small>
            </article>
            <article>
              <span>ROAS</span>
              <strong>{decimal(metrics.roas, 2)}×</strong>
              <small>Conversion value ÷ spend</small>
            </article>
          </div>

          {!hasAdsData && (
            <div className={styles.waiting}>
              <strong>Campaign live — waiting for Google reporting</strong>
              <span>
                The campaign is active, but Google Ads has not yet returned
                reportable impressions, clicks or spend for this period.
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
                <span>CRM leads attributed to Google CPC</span>
                <strong>{number(siteAttributed.leads)}</strong>
              </div>
              <p>
                Website attribution is consent-based, so it is useful for the
                commercial funnel but can be lower than Google Ads reporting.
              </p>
            </div>
          )}
        </>
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
            ? "Metrics synced " + dateLabel(summary.lastSyncedAt)
            : "Metrics will populate on the first Google Ads data sync"}
        </span>
      </div>
    </section>
  );
}
