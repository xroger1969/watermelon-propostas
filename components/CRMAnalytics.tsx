"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./CRMAnalytics.module.css";

type AnalyticsSummary = {
  today: { views: number; visitors: number; leads: number };
  last7: { views: number; visitors: number; sessions: number; leads: number };
  last30: {
    views: number;
    visitors: number;
    sessions: number;
    leads: number;
    conversionRate: number;
  };
  topPages: Array<{ path: string; views: number }>;
  sources: Array<{ source: string; visitors: number; views: number }>;
  countries: Array<{ country: string; visitors: number }>;
  daily: Array<{ day: string; views: number; visitors: number; leads: number }>;
};

function compact(value: number) {
  return new Intl.NumberFormat("en-GB", { notation: "compact" }).format(value || 0);
}

function countryLabel(code: string) {
  if (!code || code === "--") return "Unknown";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

export default function CRMAnalytics() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
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
      "watermelon_analytics_summary"
    );

    if (queryError) {
      setError(queryError.message);
    } else {
      setSummary(data as AnalyticsSummary);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60000);
    return () => window.clearInterval(timer);
  }, [load]);

  const maxDailyViews = Math.max(
    1,
    ...(summary?.daily || []).map((item) => Number(item.views) || 0)
  );

  return (
    <section className={styles.panel} aria-label="Website analytics">
      <div className={styles.heading}>
        <div>
          <p className={styles.kicker}>WEBSITE ANALYTICS</p>
          <h2>Traffic & conversion</h2>
          <p>
            First-party statistics from visitors who accepted Analytics cookies.
            No IP addresses are stored.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {summary && (
        <>
          <div className={styles.metrics}>
            <article>
              <span>Page views today</span>
              <strong>{compact(summary.today.views)}</strong>
              <small>{compact(summary.today.visitors)} unique visitors</small>
            </article>
            <article>
              <span>Visitors · 7 days</span>
              <strong>{compact(summary.last7.visitors)}</strong>
              <small>{compact(summary.last7.sessions)} sessions</small>
            </article>
            <article>
              <span>Visitors · 30 days</span>
              <strong>{compact(summary.last30.visitors)}</strong>
              <small>{compact(summary.last30.views)} page views</small>
            </article>
            <article>
              <span>Leads · 30 days</span>
              <strong>{compact(summary.last30.leads)}</strong>
              <small>Proposal, booking or AI lead</small>
            </article>
            <article>
              <span>Conversion · 30 days</span>
              <strong>{Number(summary.last30.conversionRate || 0).toFixed(1)}%</strong>
              <small>Leads ÷ unique visitors</small>
            </article>
          </div>

          <div className={styles.chartCard}>
            <div className={styles.cardHeading}>
              <div>
                <strong>Last 14 days</strong>
                <span>Page views by day</span>
              </div>
            </div>
            <div className={styles.chart}>
              {summary.daily.map((item) => {
                const views = Number(item.views) || 0;
                const height = Math.max(4, Math.round((views / maxDailyViews) * 100));
                return (
                  <div className={styles.barColumn} key={item.day} title={item.day + ": " + views + " views"}>
                    <span className={styles.barValue}>{views}</span>
                    <div className={styles.barTrack}>
                      <div className={styles.bar} style={{ height: height + "%" }} />
                    </div>
                    <small>{item.day.slice(5)}</small>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={styles.detailGrid}>
            <article className={styles.listCard}>
              <div className={styles.cardHeading}>
                <div><strong>Traffic sources</strong><span>Last 30 days</span></div>
              </div>
              {summary.sources.length === 0 ? (
                <p className={styles.empty}>No analytics data yet.</p>
              ) : (
                <div className={styles.rows}>
                  {summary.sources.map((item) => (
                    <div key={item.source}>
                      <span>{item.source}</span>
                      <strong>{item.visitors} visitors</strong>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className={styles.listCard}>
              <div className={styles.cardHeading}>
                <div><strong>Top pages</strong><span>Last 30 days</span></div>
              </div>
              {summary.topPages.length === 0 ? (
                <p className={styles.empty}>No page views yet.</p>
              ) : (
                <div className={styles.rows}>
                  {summary.topPages.map((item) => (
                    <div key={item.path}>
                      <span>{item.path}</span>
                      <strong>{item.views} views</strong>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className={styles.listCard}>
              <div className={styles.cardHeading}>
                <div><strong>Visitor countries</strong><span>Last 30 days</span></div>
              </div>
              {summary.countries.length === 0 ? (
                <p className={styles.empty}>No country data yet.</p>
              ) : (
                <div className={styles.rows}>
                  {summary.countries.map((item) => (
                    <div key={item.country}>
                      <span>{countryLabel(item.country)}</span>
                      <strong>{item.visitors} visitors</strong>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </div>
        </>
      )}

      {!summary && loading && <p className={styles.empty}>Loading website analytics…</p>}
    </section>
  );
}
