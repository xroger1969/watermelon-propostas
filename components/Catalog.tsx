"use client";

import { useEffect, useMemo, useState } from "react";
import { experiences } from "@/data/products";
import { viatorListings } from "@/data/viator";

type ProposalItem = {
  code: string;
  title: string;
  optionCode: string;
  optionName: string;
  price: string;
  notes: string;
};

type LivePrice = {
  code: string;
  price: number;
  currency: string;
};

type LiveProductDetails = {
  images?: string[];
  inclusions?: string[];
  exclusions?: string[];
  meetingPoint?: string;
  pickup?: string;
};

type PriceResponse = {
  prices?: LivePrice[];
  source?: string;
  updatedAt?: string;
};

type LiveCatalogProduct = {
  code: string;
  title: string;
  description: string;
  image: string;
  url: string;
  duration: string;
  category: string;
  location: string;
  rating?: number;
  reviews?: number;
  options?: Array<{
    optionCode: string;
    optionName: string;
    optionDescription: string;
  }>;
};

type CatalogResponse = {
  products?: LiveCatalogProduct[];
  source?: string;
  updatedAt?: string;
};

const STORAGE_KEY = "watermelon-proposal";

function readProposal(): ProposalItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function money(value: number, currency = "EUR") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

function affiliateUrl(url: string) {
  try {
    const target = new URL(url);
    target.searchParams.set("pid", "P00321532");
    target.searchParams.set("mcid", "42383");
    target.searchParams.set("medium", "link");
    target.searchParams.set("campaign", "watermelon-site");
    return target.toString();
  } catch {
    return url;
  }
}

export default function Catalog() {
  const staticProducts = useMemo(
    () =>
      experiences
        .filter((product) => Boolean(viatorListings[product.code]))
        .map((product) => ({ ...product, viator: viatorListings[product.code] })),
    []
  );

  const [liveCatalogProducts, setLiveCatalogProducts] = useState<LiveCatalogProduct[] | null>(null);
  const [catalogSyncActive, setCatalogSyncActive] = useState(false);

  const products = useMemo(() => {
    if (liveCatalogProducts === null) return staticProducts;

    const liveByCode = new Map(liveCatalogProducts.map((product) => [product.code, product]));
    const activeCodes = new Set(liveCatalogProducts.map((product) => product.code));

    const known = staticProducts
      .filter((product) => activeCodes.has(product.code))
      .map((product) => {
        const live = liveByCode.get(product.code);
        if (!live) return product;

        return {
          ...product,
          description: live.description || product.description,
          options: live.options?.length
            ? live.options.map((option) => ({
                ...option,
                startTimes: "",
                pickup: false,
              }))
            : product.options,
          viator: {
            ...product.viator,
            title: live.title || product.viator.title,
            image: live.image || product.viator.image,
            url: live.url || product.viator.url,
            duration: live.duration && live.duration !== "Duration on request" ? live.duration : product.viator.duration,
            rating: live.rating ?? product.viator.rating,
            reviews: live.reviews ?? product.viator.reviews,
          },
        };
      });

    const knownCodes = new Set(known.map((product) => product.code));
    const newcomers = liveCatalogProducts
      .filter((product) => !knownCodes.has(product.code))
      .map((product) => ({
        code: product.code,
        category: product.category || "Private Tours",
        location: product.location || "Portugal",
        description: product.description,
        apiEnabled: true,
        options: (product.options?.length
          ? product.options
          : [{ optionCode: "DEFAULT", optionName: "Standard option", optionDescription: "" }]
        ).map((option) => ({
          ...option,
          startTimes: "",
          pickup: false,
        })),
        viator: {
          code: product.code,
          title: product.title,
          price: 0,
          currency: "EUR" as const,
          image: product.image || "/logo-full.jpg",
          url: product.url || "#",
          duration: product.duration || "Duration on request",
          rating: product.rating,
          reviews: product.reviews,
        },
      }));

    return [...known, ...newcomers];
  }, [liveCatalogProducts, staticProducts]);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(products.map((p) => p.category)))],
    [products]
  );

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [addedCode, setAddedCode] = useState<string | null>(null);
  const [detailCode, setDetailCode] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<Record<string, string[]>>({});
  const [productDetails, setProductDetails] = useState<Record<string, LiveProductDetails>>({});
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [livePrices, setLivePrices] = useState<Record<string, LivePrice>>({});
  const [livePricingActive, setLivePricingActive] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function refreshCatalog() {
      try {
        const response = await fetch("/api/viator-catalog", { cache: "no-store" });
        if (!response.ok) return;

        const data = (await response.json()) as CatalogResponse;
        if (cancelled || !Array.isArray(data.products)) return;

        setLiveCatalogProducts(data.products);
        setCatalogSyncActive(data.source === "viator-partner-api");
      } catch {
        // Keep the confirmed local catalogue if the live API is temporarily unavailable.
      }
    }

    refreshCatalog();
    const timer = window.setInterval(refreshCatalog, 15 * 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!detailCode) return;
    setGalleryIndex(0);

    if (!galleryImages[detailCode]) {
      fetch(`/api/viator-product?code=${encodeURIComponent(detailCode)}`)
        .then((response) => response.ok ? response.json() : null)
        .then((data) => {
          if (data) {
            setProductDetails((current) => ({ ...current, [detailCode]: data }));
            if (data.images?.length) {
              setGalleryImages((current) => ({ ...current, [detailCode]: data.images }));
            }
          }
        })
        .catch(() => {});
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDetailCode(null);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [detailCode, galleryImages]);

  useEffect(() => {
    let cancelled = false;

    async function refreshPrices() {
      try {
        const response = await fetch("/api/viator-prices", { cache: "no-store" });
        if (!response.ok) return;

        const data = (await response.json()) as PriceResponse;
        if (cancelled || !Array.isArray(data.prices)) return;

        const map = Object.fromEntries(data.prices.map((item) => [item.code, item]));
        setLivePrices(map);
        setLivePricingActive(data.source === "viator-partner-api");
      } catch {
        // Keep the last confirmed catalogue prices if the live API is temporarily unavailable.
      }
    }

    refreshPrices();
    const timer = window.setInterval(refreshPrices, 15 * 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((product) => {
      const categoryMatch = category === "All" || product.category === category;
      const queryMatch =
        !q ||
        product.viator.title.toLowerCase().includes(q) ||
        product.location.toLowerCase().includes(q) ||
        product.code.toLowerCase().includes(q);
      return categoryMatch && queryMatch;
    });
  }, [products, query, category]);

  function priceFor(code: string) {
    const live = livePrices[code];
    const fallback = viatorListings[code];

    return {
      price: live?.price ?? fallback?.price ?? null,
      currency: live?.currency ?? fallback?.currency ?? "EUR",
      isLive: Boolean(live),
    };
  }

  function addToProposal(product: (typeof products)[number]) {
    const option = product.options[0];
    const currentPrice = priceFor(product.code);
    const existing = readProposal();
    const already = existing.some((item) => item.code === product.code);

    if (!already) {
      existing.push({
        code: product.code,
        title: product.viator.title,
        optionCode: option?.optionCode || "DEFAULT",
        optionName: option?.optionName || "Standard option",
        price: currentPrice.price === null ? "" : String(currentPrice.price),
        notes: "",
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    }

    setAddedCode(product.code);
    window.setTimeout(() => {
      window.location.href = "/proposta";
    }, 450);
  }

  return (
    <section className="catalog-section" id="experiencias">
      <div className="section-heading">
        <div>
          <p className="eyebrow dark">EXPERIENCES</p>
          <h2>Watermelon Experiences</h2>
        </div>
        <span className="price-check">
          {catalogSyncActive && livePricingActive ? "Catalogue & prices updated automatically" : livePricingActive ? "Prices updated automatically" : "Viator catalogue"}
        </span>
      </div>

      <div className="filters">
        <label className="search-box">
          <span>Search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Lisbon, beach, horses, Arrábida…"
          />
        </label>
        <div className="category-row" aria-label="Categories">
          {categories.map((item) => (
            <button
              type="button"
              key={item}
              className={category === item ? "chip chip-active" : "chip"}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="catalog-count">
        {filtered.length} {filtered.length === 1 ? "experience" : "experiences"}
      </div>

      <div className="product-grid">
        {filtered.map((product) => {
          const currentPrice = priceFor(product.code);

          return (
            <article className="product-card catalog-card" key={product.code}>
              <a
                className="product-photo-link"
                href={affiliateUrl(product.viator.url)}
                target="_blank"
                rel="sponsored noreferrer"
                aria-label={"View " + product.viator.title + " on Viator"}
              >
                <img
                  className="product-photo"
                  src={product.viator.image}
                  alt={product.viator.title}
                  loading="lazy"
                />
                <span className="photo-badge">{product.category}</span>
              </a>

              <div className="product-body">
                <div className="product-meta">
                  <span>{product.location}</span>
                  <span>{product.viator.duration}</span>
                </div>

                <h3>{product.viator.title}</h3>

                {product.description && (
                  <div className="product-description-wrap">
                    <p className="product-description">{product.description}</p>
                    <button
                      className="product-details-toggle"
                      type="button"
                      onClick={() => setDetailCode(product.code)}
                    >
                      View details →
                    </button>
                  </div>
                )}

                <div className="catalog-bottom">
                  <div className="price-block">
                    <span>From</span>
                    <strong>{currentPrice.price === null ? "On request" : money(currentPrice.price, currentPrice.currency)}</strong>
                    <small>{currentPrice.price === null ? "price confirmed on request" : currentPrice.isLive ? "price updated automatically" : "Viator price"}</small>
                  </div>

                  {product.viator.rating && (
                    <div className="rating-block">
                      <strong>★ {product.viator.rating.toFixed(1)}</strong>
                      <span>{product.viator.reviews || 0} reviews</span>
                    </div>
                  )}
                </div>

                <a
                  className="button button-card viator-button"
                  href={affiliateUrl(product.viator.url)}
                  target="_blank"
                  rel="sponsored noreferrer"
                >
                  Check availability on Viator
                </a>

                <button
                  className="proposal-secondary"
                  type="button"
                  onClick={() => addToProposal(product)}
                >
                  {addedCode === product.code ? "Added to proposal ✓" : "Add to my personalized proposal"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <p className="catalog-note">
        Prices shown are “from” prices. The final price may vary depending on the date,
        number of guests, selected option and availability.
      </p>

      {filtered.length === 0 && (
        <div className="empty-state">
          <h3>No experiences found</h3>
          <p>Try another search or choose a different category.</p>
        </div>
      )}

      {detailCode && (() => {
        const product = products.find((item) => item.code === detailCode);
        if (!product) return null;
        const currentPrice = priceFor(product.code);
        return (
          <div className="experience-modal-backdrop" role="presentation" onClick={() => setDetailCode(null)}>
            <section
              className="experience-modal"
              role="dialog"
              aria-modal="true"
              aria-label={product.viator.title}
              onClick={(event) => event.stopPropagation()}
            >
              <button className="experience-modal-close" type="button" aria-label="Close" onClick={() => setDetailCode(null)}>×</button>
              <div
                className="experience-modal-gallery"
                onTouchStart={(event) => setTouchStartX(event.touches[0]?.clientX ?? null)}
                onTouchEnd={(event) => {
                  if (touchStartX === null || !galleryImages[product.code]?.length) return;
                  const endX = event.changedTouches[0]?.clientX ?? touchStartX;
                  const delta = endX - touchStartX;
                  const total = galleryImages[product.code].length;
                  if (Math.abs(delta) > 45) {
                    setGalleryIndex((index) => delta < 0 ? (index + 1) % total : (index - 1 + total) % total);
                  }
                  setTouchStartX(null);
                }}
              >
                <img
                  className="experience-modal-image"
                  src={(galleryImages[product.code]?.length ? galleryImages[product.code] : [product.viator.image])[galleryIndex] || product.viator.image}
                  alt={product.viator.title}
                />
                {(galleryImages[product.code]?.length || 1) > 1 && (
                  <>
                    <button className="gallery-nav gallery-prev" type="button" aria-label="Previous photo" onClick={() => {
                      const total = galleryImages[product.code].length;
                      setGalleryIndex((index) => (index - 1 + total) % total);
                    }}>‹</button>
                    <button className="gallery-nav gallery-next" type="button" aria-label="Next photo" onClick={() => {
                      const total = galleryImages[product.code].length;
                      setGalleryIndex((index) => (index + 1) % total);
                    }}>›</button>
                    <span className="gallery-count">{galleryIndex + 1} / {galleryImages[product.code].length}</span>
                  </>
                )}
              </div>
              <div className="experience-modal-content">
                <div className="experience-modal-kicker">
                  <span>{product.category}</span>
                  <span>{product.location} · {product.viator.duration}</span>
                </div>
                <h2>{product.viator.title}</h2>
                <p className="experience-modal-description">{product.description}</p>
                {productDetails[product.code] && (
                  <div className="experience-modal-facts">
                    {productDetails[product.code].inclusions?.length ? (
                      <div>
                        <h3>Included</h3>
                        <ul>
                          {productDetails[product.code].inclusions!.slice(0, 6).map((item, index) => <li key={index}>{item}</li>)}
                        </ul>
                      </div>
                    ) : null}
                    {productDetails[product.code].exclusions?.length ? (
                      <div>
                        <h3>Not included</h3>
                        <ul>
                          {productDetails[product.code].exclusions!.slice(0, 4).map((item, index) => <li key={index}>{item}</li>)}
                        </ul>
                      </div>
                    ) : null}
                    {productDetails[product.code].meetingPoint ? (
                      <div>
                        <h3>Meeting point</h3>
                        <p>{productDetails[product.code].meetingPoint}</p>
                      </div>
                    ) : null}
                    {productDetails[product.code].pickup ? (
                      <div>
                        <h3>Pickup</h3>
                        <p>{productDetails[product.code].pickup}</p>
                      </div>
                    ) : null}
                  </div>
                )}
                <div className="experience-modal-summary">
                  <div className="price-block">
                    <span>From</span>
                    <strong>{currentPrice.price === null ? "On request" : money(currentPrice.price, currentPrice.currency)}</strong>
                    <small>{currentPrice.price === null ? "price confirmed on request" : currentPrice.isLive ? "price updated automatically" : "Viator price"}</small>
                  </div>
                  {product.viator.rating && (
                    <div className="rating-block">
                      <strong>★ {product.viator.rating.toFixed(1)}</strong>
                      <span>{product.viator.reviews || 0} reviews</span>
                    </div>
                  )}
                </div>
                <a className="button button-card viator-button" href={affiliateUrl(product.viator.url)} target="_blank" rel="sponsored noreferrer">
                  Check availability on Viator
                </a>
                <button className="proposal-secondary" type="button" onClick={() => addToProposal(product)}>
                  {addedCode === product.code ? "Added to proposal ✓" : "Add to my personalized proposal"}
                </button>
              </div>
            </section>
          </div>
        );
      })()}
    </section>
  );
}
