"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./ConsentBanner.module.css";

const STORAGE_KEY = "watermelon-consent-v1";

type ConsentChoice = {
  advertising: boolean;
  analytics: boolean;
  updatedAt: string;
};

type GtagWindow = Window & {
  gtag?: (...args: unknown[]) => void;
};

function readChoice(): ConsentChoice | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConsentChoice>;
    if (
      typeof parsed.advertising !== "boolean" ||
      typeof parsed.analytics !== "boolean"
    ) {
      return null;
    }
    return {
      advertising: parsed.advertising,
      analytics: parsed.analytics,
      updatedAt:
        typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function applyChoice(choice: ConsentChoice) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
  } catch {}

  const gtag = (window as GtagWindow).gtag;
  gtag?.("consent", "update", {
    ad_storage: choice.advertising ? "granted" : "denied",
    ad_user_data: choice.advertising ? "granted" : "denied",
    ad_personalization: choice.advertising ? "granted" : "denied",
    analytics_storage: choice.analytics ? "granted" : "denied",
  });

  window.dispatchEvent(
    new CustomEvent("watermelon-consent-changed", { detail: choice })
  );
}

export default function ConsentBanner() {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [advertising, setAdvertising] = useState(false);
  const [analytics, setAnalytics] = useState(false);

  useEffect(() => {
    const saved = readChoice();
    if (saved) {
      setAdvertising(saved.advertising);
      setAnalytics(saved.analytics);
      setOpen(false);
    } else {
      setOpen(true);
    }
    setReady(true);
  }, []);

  if (!ready) return null;

  const save = (nextAdvertising: boolean, nextAnalytics: boolean) => {
    const choice: ConsentChoice = {
      advertising: nextAdvertising,
      analytics: nextAnalytics,
      updatedAt: new Date().toISOString(),
    };
    setAdvertising(nextAdvertising);
    setAnalytics(nextAnalytics);
    applyChoice(choice);
    setCustomize(false);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        className={styles.settingsButton}
        onClick={() => setOpen(true)}
        aria-label="Open cookie settings"
      >
        Cookie settings
      </button>
    );
  }

  return (
    <div className={styles.backdrop} role="presentation">
      <section
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-consent-title"
      >
        <div className={styles.copy}>
          <p className={styles.kicker}>YOUR PRIVACY</p>
          <h2 id="cookie-consent-title">Choose your cookie preferences</h2>
          <p>
            We use essential technology to run the site. With your permission,
            we also use Google measurement and advertising technology to
            understand campaign performance and improve our marketing.
          </p>
          <p className={styles.policy}>
            You can change your choice at any time.{" "}
            <Link href="/privacy">Read our Privacy Policy</Link>.
          </p>
        </div>

        {customize ? (
          <div className={styles.preferences}>
            <label className={styles.preferenceRow}>
              <span>
                <strong>Essential</strong>
                <small>Required for the website to function.</small>
              </span>
              <input type="checkbox" checked disabled aria-label="Essential cookies enabled" />
            </label>

            <label className={styles.preferenceRow}>
              <span>
                <strong>Analytics</strong>
                <small>Helps us understand how visitors use the site.</small>
              </span>
              <input
                type="checkbox"
                checked={analytics}
                onChange={(event) => setAnalytics(event.target.checked)}
              />
            </label>

            <label className={styles.preferenceRow}>
              <span>
                <strong>Advertising</strong>
                <small>
                  Allows Google Ads measurement and, where applicable,
                  advertising personalisation.
                </small>
              </span>
              <input
                type="checkbox"
                checked={advertising}
                onChange={(event) => setAdvertising(event.target.checked)}
              />
            </label>

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => save(false, false)}
              >
                Reject optional
              </button>
              <button
                type="button"
                className={styles.primary}
                onClick={() => save(advertising, analytics)}
              >
                Save preferences
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => save(false, false)}
            >
              Reject optional
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setCustomize(true)}
            >
              Manage preferences
            </button>
            <button
              type="button"
              className={styles.primary}
              onClick={() => save(true, true)}
            >
              Accept all
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
