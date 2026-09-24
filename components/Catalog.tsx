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
  return new Intl.NumberFormat("pt-PT", {
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
  const products = useMemo(
    () =>
      experiences
        .filter((product) => Boolean(viatorListings[product.code]))
        .map((product) => ({ ...product, viator: viatorListings[product.code] })),
    []
  );

  const categories = useMemo(
    () => ["Todas", ...Array.from(new Set(products.map((p) => p.category)))],
    [products]
  );

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todas");
  const [addedCode, setAddedCode] = useState<string | null>(null);
  const [detailCode, setDetailCode] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<Record<string, string[]>>({});
  const [productDetails, setProductDetails] = useState<Record<string, LiveProductDetails>>({});
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [livePrices, setLivePrices] = useState<Record<string, LivePrice>>({});
  const [livePricingActive, setLivePricingActive] = useState(false);

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
        if (cancelled || !Array.isArray(data.prices) || data.prices.length === 0) return;

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
      const categoryMatch = category === "Todas" || product.category === category;
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
      price: live?.price ?? fallback.price,
      currency: live?.currency ?? fallback.currency,
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
        optionName: option?.optionName || "Opção standard",
        price: String(currentPrice.price),
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
          <p className="eyebrow dark">EXPERIÊNCIAS</p>
          <h2>Watermelon Experiences</h2>
        </div>
        <span className="price-check">
          {livePricingActive ? "Preços atualizados automaticamente" : "Preços Viator"}
        </span>
      </div>

      <div className="filters">
        <label className="search-box">
          <span>Pesquisar</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Lisboa, praia, cavalos, Arrábida…"
          />
        </label>
        <div className="category-row" aria-label="Categorias">
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
        {filtered.length} {filtered.length === 1 ? "experiência" : "experiências"}
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
                aria-label={"Ver " + product.viator.title + " na Viator"}
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
                      Ver detalhes →
                    </button>
                  </div>
                )}

                <div className="catalog-bottom">
                  <div className="price-block">
                    <span>Desde</span>
                    <strong>{money(currentPrice.price, currentPrice.currency)}</strong>
                    <small>{currentPrice.isLive ? "preço atualizado automaticamente" : "preço Viator"}</small>
                  </div>

                  {product.viator.rating && (
                    <div className="rating-block">
                      <strong>★ {product.viator.rating.toFixed(1)}</strong>
                      <span>{product.viator.reviews || 0} avaliações</span>
                    </div>
                  )}
                </div>

                <a
                  className="button button-card viator-button"
                  href={affiliateUrl(product.viator.url)}
                  target="_blank"
                  rel="sponsored noreferrer"
                >
                  Ver disponibilidade na Viator
                </a>

                <button
                  className="proposal-secondary"
                  type="button"
                  onClick={() => addToProposal(product)}
                >
                  {addedCode === product.code ? "Adicionado à proposta ✓" : "Adicionar a uma proposta personalizada"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <p className="catalog-note">
        Os valores apresentados são preços “desde”. O preço final pode variar conforme a data,
        o número de participantes, a opção escolhida e a disponibilidade.
      </p>

      {filtered.length === 0 && (
        <div className="empty-state">
          <h3>Nenhuma experiência encontrada</h3>
          <p>Tente outro termo ou selecione outra categoria.</p>
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
              <button className="experience-modal-close" type="button" aria-label="Fechar" onClick={() => setDetailCode(null)}>×</button>
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
                    <button className="gallery-nav gallery-prev" type="button" aria-label="Fotografia anterior" onClick={() => {
                      const total = galleryImages[product.code].length;
                      setGalleryIndex((index) => (index - 1 + total) % total);
                    }}>‹</button>
                    <button className="gallery-nav gallery-next" type="button" aria-label="Fotografia seguinte" onClick={() => {
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
                        <h3>Incluído</h3>
                        <ul>
                          {productDetails[product.code].inclusions!.slice(0, 6).map((item, index) => <li key={index}>{item}</li>)}
                        </ul>
                      </div>
                    ) : null}
                    {productDetails[product.code].exclusions?.length ? (
                      <div>
                        <h3>Não incluído</h3>
                        <ul>
                          {productDetails[product.code].exclusions!.slice(0, 4).map((item, index) => <li key={index}>{item}</li>)}
                        </ul>
                      </div>
                    ) : null}
                    {productDetails[product.code].meetingPoint ? (
                      <div>
                        <h3>Ponto de encontro</h3>
                        <p>{productDetails[product.code].meetingPoint}</p>
                      </div>
                    ) : null}
                    {productDetails[product.code].pickup ? (
                      <div>
                        <h3>Recolha</h3>
                        <p>{productDetails[product.code].pickup}</p>
                      </div>
                    ) : null}
                  </div>
                )}
                <div className="experience-modal-summary">
                  <div className="price-block">
                    <span>Desde</span>
                    <strong>{money(currentPrice.price, currentPrice.currency)}</strong>
                    <small>{currentPrice.isLive ? "preço atualizado automaticamente" : "preço Viator"}</small>
                  </div>
                  {product.viator.rating && (
                    <div className="rating-block">
                      <strong>★ {product.viator.rating.toFixed(1)}</strong>
                      <span>{product.viator.reviews || 0} avaliações</span>
                    </div>
                  )}
                </div>
                <a className="button button-card viator-button" href={affiliateUrl(product.viator.url)} target="_blank" rel="sponsored noreferrer">
                  Ver disponibilidade na Viator
                </a>
                <button className="proposal-secondary" type="button" onClick={() => addToProposal(product)}>
                  {addedCode === product.code ? "Adicionado à proposta ✓" : "Adicionar a uma proposta personalizada"}
                </button>
              </div>
            </section>
          </div>
        );
      })()}
    </section>
  );
}
