"use client";

import { useMemo, useState } from "react";
import { experiences } from "@/data/products";
import { viatorListings, viatorPriceCheckedAt } from "@/data/viator";

type ProposalItem = {
  code: string;
  title: string;
  optionCode: string;
  optionName: string;
  price: string;
  notes: string;
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

function euro(value: number) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
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

  function addToProposal(product: (typeof products)[number]) {
    const option = product.options[0];
    const existing = readProposal();
    const already = existing.some((item) => item.code === product.code);

    if (!already) {
      existing.push({
        code: product.code,
        title: product.viator.title,
        optionCode: option?.optionCode || "DEFAULT",
        optionName: option?.optionName || "Opção standard",
        price: String(product.viator.price),
        notes: "",
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    }

    setAddedCode(product.code);
    window.setTimeout(() => setAddedCode(null), 1400);
  }

  return (
    <section className="catalog-section" id="experiencias">
      <div className="section-heading">
        <div>
          <p className="eyebrow dark">EXPERIÊNCIAS</p>
          <h2>Watermelon Experiences</h2>
        </div>
        <span className="price-check">Preços Viator consultados em {viatorPriceCheckedAt}</span>
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
        {filtered.map((product) => (
          <article className="product-card catalog-card" key={product.code}>
            <a
              className="product-photo-link"
              href={product.viator.url}
              target="_blank"
              rel="noreferrer"
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
                <p className="product-description">{product.description}</p>
              )}

              <div className="catalog-bottom">
                <div className="price-block">
                  <span>Desde</span>
                  <strong>{euro(product.viator.price)}</strong>
                  <small>preço apresentado na Viator</small>
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
                href={product.viator.url}
                target="_blank"
                rel="noreferrer"
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
        ))}
      </div>

      <p className="catalog-note">
        Os preços são valores “desde” apresentados pela Viator e podem mudar conforme a data,
        o número de participantes, a opção escolhida e a disponibilidade. A confirmação final
        é sempre feita na página da Viator.
      </p>

      {filtered.length === 0 && (
        <div className="empty-state">
          <h3>Nenhuma experiência encontrada</h3>
          <p>Tente outro termo ou selecione outra categoria.</p>
        </div>
      )}
    </section>
  );
}
