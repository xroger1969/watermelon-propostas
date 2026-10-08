"use client";

import { useEffect, useState } from "react";

type FeedPromotion = {
  key: string;
  assetName: string;
  target: string;
  percentOff: number;
  label: string;
  startsOn: string | null;
  endsOn: string | null;
  finalUrl: string;
  terms: string;
  experienceCount: number;
  productCodes: string[];
};

type Feed = {
  source?: string;
  campaignId?: string;
  generatedAt?: string;
  promotions?: FeedPromotion[];
};

export default function AdsPromotionFeedPage() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/google-ads-promotions", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load the Google Ads promotion feed.");
        return response.json() as Promise<Feed>;
      })
      .then(setFeed)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load feed."));
  }, []);

  return (
    <main className="admin-page">
      <section className="admin-shell promotion-admin-shell">
        <div className="admin-topbar">
          <div>
            <p className="eyebrow dark">WATERMELON PRIVATE AREA</p>
            <h1>Google Ads promotion feed</h1>
            <p className="crm-topbar-copy">
              Human-readable view of the promotions currently exposed for Google Ads.
            </p>
          </div>
          <div className="admin-topbar-actions promotion-nav-actions">
            <button className="button button-ghost" type="button" onClick={() => window.location.assign("/admin/promotions")}>
              Promotions
            </button>
            <button className="button button-outline" type="button" onClick={() => window.location.assign("https://watermelon-product-studio.vercel.app/")}>
              Product Studio
            </button>
            <button className="button button-ghost" type="button" onClick={() => window.open("/api/google-ads-promotions", "_blank", "noopener,noreferrer")}>
              Raw JSON
            </button>
          </div>
        </div>

        {error && <div className="admin-error">{error}</div>}

        {!feed && !error && (
          <div className="admin-loading">Loading promotion feed…</div>
        )}

        {feed && (
          <>
            <div className="promotion-ads-sync-card">
              <div className="promotion-ads-sync-grid">
                <div>
                  <span>Campaign</span>
                  <strong>{feed.campaignId || "—"}</strong>
                  <small>Google Ads campaign configured for this feed.</small>
                </div>
                <div>
                  <span>Promotion groups</span>
                  <strong>{feed.promotions?.length || 0}</strong>
                  <small>Groups are combined when the offer rules match.</small>
                </div>
                <div>
                  <span>Generated</span>
                  <strong>{feed.generatedAt ? new Date(feed.generatedAt).toLocaleString("en-GB") : "—"}</strong>
                  <small>Live response from the Watermelon promotions database.</small>
                </div>
              </div>
            </div>

            <div className="promotion-list-card">
              <div className="block-title">
                <span>Ads</span>
                <div>
                  <h2>Promotion assets</h2>
                  <p>These are the promotion groups available to the Google Ads sync.</p>
                </div>
              </div>

              {(feed.promotions || []).length === 0 ? (
                <div className="admin-empty">
                  <h2>No active promotions</h2>
                  <p>No valid Before / Now offer is currently available to Google Ads.</p>
                </div>
              ) : (
                <div className="promotion-list">
                  {(feed.promotions || []).map((promotion) => (
                    <article className="promotion-list-item" key={promotion.key}>
                      <div className="promotion-list-main">
                        <div>
                          <strong>{promotion.label}</strong>
                          <p>{promotion.assetName}</p>
                        </div>
                        <div className="promotion-list-prices">
                          <strong>{promotion.percentOff}% OFF</strong>
                        </div>
                      </div>
                      <p>
                        <b>{promotion.experienceCount}</b> experiences · target: {promotion.target}
                      </p>
                      <p>
                        {promotion.startsOn || "No start date"} → {promotion.endsOn || "No end date"}
                      </p>
                      <p style={{ overflowWrap: "anywhere" }}>
                        Product codes: {promotion.productCodes.join(", ")}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
