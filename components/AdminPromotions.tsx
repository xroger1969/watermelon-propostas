"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { experiences } from "@/data/products";
import { viatorListings } from "@/data/viator";

type Promotion = {
  product_code: string;
  title: string;
  enabled: boolean;
  label: string;
  before_price: number;
  now_price: number;
  currency: string;
  starts_on: string | null;
  ends_on: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

type ProductChoice = {
  code: string;
  title: string;
  price: number | null;
  currency: string;
};

type LiveCatalogResponse = {
  products?: Array<{ code: string; title: string }>;
};

type LivePriceResponse = {
  prices?: Array<{ code: string; price: number; currency: string }>;
};

const EMPTY_FORM = {
  code: "",
  label: "Website offer",
  beforePrice: "",
  nowPrice: "",
  currency: "EUR",
  startsOn: "",
  endsOn: "",
  enabled: true,
};

function money(value: number, currency = "EUR") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

export default function AdminPromotions() {
  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  }, []);

  const [authReady, setAuthReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [actorEmail, setActorEmail] = useState("");
  const [products, setProducts] = useState<ProductChoice[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const loadPromotions = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("watermelon_site_promotions")
      .select("*")
      .order("product_code", { ascending: true });

    if (error) {
      setMessage(
        error.code === "42501"
          ? "This account is not authorized to manage promotions."
          : error.message
      );
      setPromotions([]);
    } else {
      setPromotions((data || []) as Promotion[]);
    }
    setLoading(false);
  }, [supabase]);

  const loadProducts = useCallback(async () => {
    const fallback = experiences.map((experience) => {
      const viator = viatorListings[experience.code];
      return {
        code: experience.code,
        title: viator?.title || experience.title,
        price: viator?.price ?? null,
        currency: viator?.currency || "EUR",
      } satisfies ProductChoice;
    });

    try {
      const [catalogResponse, pricesResponse] = await Promise.all([
        fetch("/api/viator-catalog", { cache: "no-store" }),
        fetch("/api/viator-prices", { cache: "no-store" }),
      ]);

      const catalog = catalogResponse.ok
        ? ((await catalogResponse.json()) as LiveCatalogResponse)
        : {};
      const prices = pricesResponse.ok
        ? ((await pricesResponse.json()) as LivePriceResponse)
        : {};

      const livePrices = new Map(
        (prices.prices || []).map((item) => [item.code, item])
      );

      const merged = new Map<string, ProductChoice>();
      fallback.forEach((item) => merged.set(item.code, item));

      (catalog.products || []).forEach((item) => {
        const livePrice = livePrices.get(item.code);
        const current = merged.get(item.code);
        merged.set(item.code, {
          code: item.code,
          title: item.title || current?.title || item.code,
          price: livePrice?.price ?? current?.price ?? null,
          currency: livePrice?.currency ?? current?.currency ?? "EUR",
        });
      });

      livePrices.forEach((item, code) => {
        const current = merged.get(code);
        if (current) {
          merged.set(code, {
            ...current,
            price: item.price,
            currency: item.currency,
          });
        }
      });

      setProducts(
        Array.from(merged.values()).sort((a, b) =>
          a.title.localeCompare(b.title, "en")
        )
      );
    } catch {
      setProducts(
        fallback.sort((a, b) => a.title.localeCompare(b.title, "en"))
      );
    }
  }, []);

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
      if (active) {
        void loadPromotions();
        void loadProducts();
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const active = Boolean(session);
      setSignedIn(active);
      setActorEmail(session?.user.email || "");
      if (active) {
        void loadPromotions();
        void loadProducts();
      } else {
        setPromotions([]);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [supabase, loadProducts, loadPromotions]);

  const selectedProduct = products.find((item) => item.code === form.code) || null;
  const existing = promotions.find((item) => item.product_code === form.code) || null;
  const before = Number(form.beforePrice);
  const now = Number(form.nowPrice);
  const discount =
    Number.isFinite(before) && Number.isFinite(now) && before > now && before > 0
      ? Math.round(((before - now) / before) * 100)
      : null;

  function chooseProduct(code: string) {
    const promotion = promotions.find((item) => item.product_code === code);
    const product = products.find((item) => item.code === code);

    if (promotion) {
      setForm({
        code,
        label: promotion.label,
        beforePrice: String(promotion.before_price),
        nowPrice: String(promotion.now_price),
        currency: promotion.currency,
        startsOn: promotion.starts_on || "",
        endsOn: promotion.ends_on || "",
        enabled: promotion.enabled,
      });
      return;
    }

    setForm({
      ...EMPTY_FORM,
      code,
      beforePrice: product?.price ? String(product.price) : "",
      currency: product?.currency || "EUR",
    });
  }

  function editPromotion(promotion: Promotion) {
    chooseProduct(promotion.product_code);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function savePromotion(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase || !selectedProduct || saving) return;

    const beforeValue = Number(form.beforePrice);
    const nowValue = Number(form.nowPrice);

    if (!Number.isFinite(beforeValue) || !Number.isFinite(nowValue)) {
      setMessage("Enter valid prices.");
      return;
    }

    if (beforeValue <= 0 || nowValue <= 0 || beforeValue <= nowValue) {
      setMessage("The Before price must be higher than the Now price.");
      return;
    }

    if (form.startsOn && form.endsOn && form.endsOn < form.startsOn) {
      setMessage("The end date cannot be before the start date.");
      return;
    }

    setSaving(true);
    setMessage("");

    const { error } = await supabase
      .from("watermelon_site_promotions")
      .upsert(
        {
          product_code: selectedProduct.code,
          title: selectedProduct.title,
          enabled: form.enabled,
          label: form.label.trim() || "Website offer",
          before_price: beforeValue,
          now_price: nowValue,
          currency: form.currency || "EUR",
          starts_on: form.startsOn || null,
          ends_on: form.endsOn || null,
          updated_at: new Date().toISOString(),
          updated_by: actorEmail || null,
        },
        { onConflict: "product_code" }
      );

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    await loadPromotions();
    setMessage("Website promotion saved. Viator pricing was not changed.");
    setSaving(false);
  }

  async function togglePromotion(promotion: Promotion) {
    if (!supabase) return;
    setMessage("");

    const { error } = await supabase
      .from("watermelon_site_promotions")
      .update({
        enabled: !promotion.enabled,
        updated_at: new Date().toISOString(),
        updated_by: actorEmail || null,
      })
      .eq("product_code", promotion.product_code);

    if (error) setMessage(error.message);
    else {
      await loadPromotions();
      if (form.code === promotion.product_code) {
        setForm((current) => ({ ...current, enabled: !promotion.enabled }));
      }
    }
  }

  async function deletePromotion(promotion: Promotion) {
    if (!supabase) return;
    if (
      !window.confirm(
        "Delete this website promotion? The normal Watermelon/Viator catalogue price will be shown again."
      )
    ) {
      return;
    }

    const { error } = await supabase
      .from("watermelon_site_promotions")
      .delete()
      .eq("product_code", promotion.product_code);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadPromotions();
    if (form.code === promotion.product_code) setForm(EMPTY_FORM);
    setMessage("Promotion removed. Viator was not affected.");
  }

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
        <div className="admin-empty">
          <h2>Promotions are unavailable.</h2>
          <p>The private database is not connected.</p>
        </div>
      </section>
    );
  }

  if (!signedIn) {
    return (
      <section className="admin-shell">
        <div className="admin-login-card">
          <p className="eyebrow dark">PRIVATE AREA</p>
          <h1>Website promotions</h1>
          <p>Sign in through the Watermelon CRM first. Your session will also open this area.</p>
          <a className="button button-primary wide" href="/crm">
            Open CRM login
          </a>
          <a className="button button-ghost wide" href="/">
            Back to website
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-shell promotion-admin-shell">
      <div className="admin-topbar">
        <div>
          <p className="eyebrow dark">WATERMELON PRIVATE AREA</p>
          <h1>Website promotions</h1>
          <p className="crm-topbar-copy">
            Create a direct-booking “Before / Now” offer for the Watermelon website only.
          </p>
        </div>
        <div className="admin-topbar-actions">
          <a className="button button-ghost" href="/crm">CRM</a>
          <a className="button button-ghost" href="/">Website</a>
        </div>
      </div>

      <div className="promotion-safety-note">
        <strong>Website only</strong>
        <span>
          These discounts change the Watermelon direct-booking price only. They never edit the Viator listing, Viator price or Viator booking button.
        </span>
      </div>

      <div className="promotion-admin-grid">
        <form className="promotion-editor-card" onSubmit={savePromotion}>
          <div className="block-title">
            <span>€</span>
            <div>
              <h2>{existing ? "Edit promotion" : "Create promotion"}</h2>
              <p>Choose an experience and define the public Before / Now price.</p>
            </div>
          </div>

          <label className="full-field">
            <span>Experience</span>
            <select
              required
              value={form.code}
              onChange={(event) => chooseProduct(event.target.value)}
            >
              <option value="">Choose an experience…</option>
              {products.map((product) => (
                <option key={product.code} value={product.code}>
                  {product.title} · {product.code}
                </option>
              ))}
            </select>
          </label>

          {selectedProduct?.price !== null && selectedProduct && (
            <div className="promotion-reference-price">
              <span>Current Viator “from” price — reference only</span>
              <strong>{money(selectedProduct.price, selectedProduct.currency)}</strong>
              <button
                type="button"
                className="button button-ghost"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    beforePrice: String(selectedProduct.price),
                    currency: selectedProduct.currency,
                  }))
                }
              >
                Use as Before
              </button>
            </div>
          )}

          <div className="form-grid">
            <label>
              <span>Before price</span>
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={form.beforePrice}
                onChange={(event) =>
                  setForm({ ...form, beforePrice: event.target.value })
                }
                placeholder="130"
              />
            </label>

            <label>
              <span>Now price</span>
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={form.nowPrice}
                onChange={(event) =>
                  setForm({ ...form, nowPrice: event.target.value })
                }
                placeholder="110"
              />
            </label>

            <label>
              <span>Promotion label</span>
              <input
                value={form.label}
                maxLength={80}
                onChange={(event) =>
                  setForm({ ...form, label: event.target.value })
                }
                placeholder="Website offer"
              />
            </label>

            <label>
              <span>Currency</span>
              <select
                value={form.currency}
                onChange={(event) =>
                  setForm({ ...form, currency: event.target.value })
                }
              >
                <option value="EUR">EUR</option>
              </select>
            </label>

            <label>
              <span>Starts on (optional)</span>
              <input
                type="date"
                value={form.startsOn}
                onChange={(event) =>
                  setForm({ ...form, startsOn: event.target.value })
                }
              />
            </label>

            <label>
              <span>Ends on (optional)</span>
              <input
                type="date"
                value={form.endsOn}
                onChange={(event) =>
                  setForm({ ...form, endsOn: event.target.value })
                }
              />
            </label>
          </div>

          <label className="promotion-enabled-control">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) =>
                setForm({ ...form, enabled: event.target.checked })
              }
            />
            <span>Promotion active on the Watermelon website</span>
          </label>

          {form.code && Number.isFinite(before) && Number.isFinite(now) && before > 0 && now > 0 && (
            <div className="promotion-preview">
              <span>{form.label || "Website offer"}</span>
              <small>Before <del>{money(before, form.currency)}</del></small>
              <strong>Now {money(now, form.currency)}</strong>
              {discount !== null && <b>Save {discount}%</b>}
              <em>Exclusive to watermelonexperiences.pt</em>
            </div>
          )}

          {message && <p className="admin-error">{message}</p>}

          <div className="promotion-editor-actions">
            <button
              className="button button-primary"
              type="submit"
              disabled={saving || !form.code}
            >
              {saving ? "Saving…" : existing ? "Save changes" : "Create promotion"}
            </button>
            <button
              className="button button-ghost"
              type="button"
              onClick={() => {
                setForm(EMPTY_FORM);
                setMessage("");
              }}
            >
              Clear
            </button>
          </div>
        </form>

        <section className="promotion-list-card">
          <div className="block-title">
            <span>✓</span>
            <div>
              <h2>Website offers</h2>
              <p>{promotions.length} promotion{promotions.length === 1 ? "" : "s"} saved.</p>
            </div>
          </div>

          {loading && <p className="admin-loading">Loading promotions…</p>}

          {!loading && promotions.length === 0 && (
            <div className="admin-empty">
              <h3>No website promotions yet.</h3>
              <p>Create one on the left. Viator continues unchanged.</p>
            </div>
          )}

          <div className="promotion-list">
            {promotions.map((promotion) => {
              const percentage = Math.round(
                ((Number(promotion.before_price) - Number(promotion.now_price)) /
                  Number(promotion.before_price)) *
                  100
              );

              return (
                <article
                  className={
                    promotion.enabled
                      ? "promotion-list-item"
                      : "promotion-list-item promotion-list-item-inactive"
                  }
                  key={promotion.product_code}
                >
                  <header>
                    <div>
                      <span>{promotion.product_code}</span>
                      <h3>{promotion.title}</h3>
                    </div>
                    <b>{promotion.enabled ? "Active" : "Paused"}</b>
                  </header>

                  <div className="promotion-list-prices">
                    <span>Before <del>{money(Number(promotion.before_price), promotion.currency)}</del></span>
                    <strong>Now {money(Number(promotion.now_price), promotion.currency)}</strong>
                    <em>−{percentage}%</em>
                  </div>

                  <p>
                    {promotion.label}
                    {promotion.starts_on ? " · from " + promotion.starts_on : ""}
                    {promotion.ends_on ? " · until " + promotion.ends_on : ""}
                  </p>

                  <div className="promotion-list-actions">
                    <button
                      className="button button-outline"
                      type="button"
                      onClick={() => editPromotion(promotion)}
                    >
                      Edit
                    </button>
                    <button
                      className="button button-ghost"
                      type="button"
                      onClick={() => void togglePromotion(promotion)}
                    >
                      {promotion.enabled ? "Pause" : "Activate"}
                    </button>
                    <button
                      className="button crm-danger-button"
                      type="button"
                      onClick={() => void deletePromotion(promotion)}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}
