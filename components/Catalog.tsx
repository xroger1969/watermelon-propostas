"use client";

import { useMemo, useState } from "react";
import type { Experience } from "@/data/products";

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

function categoryClass(category: string) {
  const key = category.toLowerCase();
  if (key.includes("cavalo")) return "cover-horse";
  if (key.includes("mar")) return "cover-sea";
  if (key.includes("praia")) return "cover-beach";
  if (key.includes("cultura")) return "cover-culture";
  if (key.includes("arrábida")) return "cover-arrabida";
  if (key.includes("lisboa")) return "cover-lisbon";
  return "cover-tour";
}

export default function Catalog({ products }: { products: Experience[] }) {
  const categories = useMemo(
    () => ["Todas", ...Array.from(new Set(products.map((p) => p.category)))],
    [products]
  );
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todas");
  const [addedCode, setAddedCode] = useState<string | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((product) => {
      const categoryMatch = category === "Todas" || product.category === category;
      const queryMatch =
        !q ||
        product.title.toLowerCase().includes(q) ||
        product.location.toLowerCase().includes(q) ||
        product.code.toLowerCase().includes(q);
      return categoryMatch && queryMatch;
    });
  }, [products, query, category]);

  function addToProposal(product: Experience) {
    const selectedCode = selectedOptions[product.code] || product.options[0]?.optionCode || "DEFAULT";
    const selected = product.options.find((o) => o.optionCode === selectedCode) || product.options[0];
    const existing = readProposal();
    const key = product.code + "-" + (selected?.optionCode || "DEFAULT");
    const already = existing.some((item) => item.code + "-" + item.optionCode === key);

    if (!already) {
      existing.push({
        code: product.code,
        title: product.title,
        optionCode: selected?.optionCode || "DEFAULT",
        optionName: selected?.optionName || "Opção standard",
        price: "",
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
          <p className="eyebrow dark">CATÁLOGO</p>
          <h2>Experiências Watermelon</h2>
        </div>
        <a className="text-link" href="/proposta">Ver proposta →</a>
      </div>

      <div className="filters">
        <label className="search-box">
          <span>Pesquisar</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Lisboa, praia, cavalos, código…"
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
          const optionCode = selectedOptions[product.code] || product.options[0]?.optionCode || "DEFAULT";
          const option = product.options.find((o) => o.optionCode === optionCode) || product.options[0];
          return (
            <article className="product-card" key={product.code}>
              <div className={"product-cover " + categoryClass(product.category)}>
                <span className="cover-category">{product.category}</span>
                <span className="cover-location">{product.location}</span>
              </div>
              <div className="product-body">
                <div className="product-meta">
                  <span>{product.code}</span>
                  {option?.pickup && <span>Pickup disponível</span>}
                </div>
                <h3>{product.title}</h3>
                <p className="product-description">{product.description}</p>

                {product.options.length > 1 ? (
                  <label className="option-field">
                    <span>Opção</span>
                    <select
                      value={optionCode}
                      onChange={(e) =>
                        setSelectedOptions((current) => ({ ...current, [product.code]: e.target.value }))
                      }
                    >
                      {product.options.map((item) => (
                        <option key={item.optionCode} value={item.optionCode}>
                          {item.optionName} ({item.optionCode})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="single-option">{option?.optionName || "Opção standard"}</div>
                )}

                {option?.startTimes && (
                  <div className="start-times"><strong>Horários:</strong> {option.startTimes}</div>
                )}

                <details className="details">
                  <summary>Ver detalhes</summary>
                  <div className="details-body">
                    {option?.optionDescription ? <p>{option.optionDescription}</p> : <p>Detalhes completos serão confirmados na proposta.</p>}
                    <p><strong>Preço:</strong> a definir na proposta.</p>
                  </div>
                </details>

                <button className="button button-card" type="button" onClick={() => addToProposal(product)}>
                  {addedCode === product.code ? "Adicionado ✓" : "Adicionar à proposta"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="empty-state">
          <h3>Nenhum programa encontrado</h3>
          <p>Tente outro termo ou selecione outra categoria.</p>
        </div>
      )}
    </section>
  );
}
