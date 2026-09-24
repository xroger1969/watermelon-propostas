"use client";

import { useEffect, useMemo, useState } from "react";

type ProposalItem = {
  code: string;
  title: string;
  optionCode: string;
  optionName: string;
  price: string;
  notes: string;
};

type ClientData = {
  name: string;
  email: string;
  phone: string;
  date: string;
  people: string;
  notes: string;
};

const STORAGE_KEY = "watermelon-proposal";

function money(value: number) {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(value);
}

export default function ProposalBuilder() {
  const [items, setItems] = useState<ProposalItem[]>([]);
  const [client, setClient] = useState<ClientData>({
    name: "",
    email: "",
    phone: "",
    date: "",
    people: "",
    notes: "",
  });

  useEffect(() => {
    try {
      setItems(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
    } catch {
      setItems([]);
    }
  }, []);

  function persist(next: ProposalItem[]) {
    setItems(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function updateItem(index: number, patch: Partial<ProposalItem>) {
    persist(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function removeItem(index: number) {
    persist(items.filter((_, i) => i !== index));
  }

  const total = useMemo(
    () => items.reduce((sum, item) => sum + (Number.parseFloat(item.price.replace(",", ".")) || 0), 0),
    [items]
  );

  function proposalText() {
    const lines = [
      "WATERMELON EXPERIENCES",
      "Proposta personalizada",
      "",
      client.name ? "Cliente: " + client.name : "",
      client.date ? "Data: " + client.date : "",
      client.people ? "Participantes: " + client.people : "",
      "",
      ...items.flatMap((item, index) => [
        (index + 1) + ". " + item.title,
        item.optionName ? "   Opção: " + item.optionName : "",
        item.price ? "   Valor: " + money(Number.parseFloat(item.price.replace(",", ".")) || 0) : "   Valor: sob consulta",
        item.notes ? "   Nota: " + item.notes : "",
        "",
      ]),
      "Total: " + money(total),
      client.notes ? "" : "",
      client.notes ? "Observações: " + client.notes : "",
      "",
      "Watermelon Experiences",
    ].filter(Boolean);
    return lines.join("\n");
  }

  function shareWhatsApp() {
    const url = "https://wa.me/?text=" + encodeURIComponent(proposalText());
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function clearProposal() {
    if (!window.confirm("Limpar todos os programas desta proposta?")) return;
    persist([]);
  }

  return (
    <section className="proposal-shell">
      <div className="proposal-form">
        <div className="proposal-block">
          <div className="block-title">
            <span>1</span>
            <div>
              <h2>Os seus dados</h2>
              <p>Para podermos preparar e confirmar a sua proposta.</p>
            </div>
          </div>
          <div className="form-grid">
            <label><span>Nome</span><input value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} placeholder="Nome do cliente" /></label>
            <label><span>Email</span><input type="email" value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} placeholder="cliente@email.com" /></label>
            <label><span>Telefone</span><input value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} placeholder="+351 …" /></label>
            <label><span>Data pretendida</span><input type="date" value={client.date} onChange={(e) => setClient({ ...client, date: e.target.value })} /></label>
            <label><span>N.º de participantes</span><input inputMode="numeric" value={client.people} onChange={(e) => setClient({ ...client, people: e.target.value })} placeholder="Ex.: 4" /></label>
          </div>
        </div>

        <div className="proposal-block">
          <div className="block-title">
            <span>2</span>
            <div>
              <h2>Experiências</h2>
              <p>Confirme os programas escolhidos e acrescente alguma indicação, se necessário.</p>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="proposal-empty">
              <h3>A proposta ainda está vazia.</h3>
              <p>Volte ao catálogo e adicione os programas pretendidos.</p>
              <a className="button button-primary" href="/#experiencias">Escolher experiências</a>
            </div>
          ) : (
            <div className="proposal-items">
              {items.map((item, index) => (
                <article className="proposal-item" key={item.code + "-" + item.optionCode + "-" + index}>
                  <div className="proposal-item-head">
                    <div>
                      <span className="code-pill">{item.code}</span>
                      <h3>{item.title}</h3>
                      <p>{item.optionName}</p>
                    </div>
                    <button className="remove-button" onClick={() => removeItem(index)} type="button">Remover</button>
                  </div>
                  <div className="proposal-item-fields">
                    <div className="proposal-price-display">
                      <span>Valor de referência</span>
                      <strong>{item.price ? money(Number.parseFloat(item.price.replace(",", ".")) || 0) : "Sob consulta"}</strong>
                    </div>
                    <label className="grow">
                      <span>Pedido especial</span>
                      <input
                        value={item.notes}
                        onChange={(e) => updateItem(index, { notes: e.target.value })}
                        placeholder="Ex.: recolha no hotel, horário preferido…"
                      />
                    </label>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="proposal-block">
          <div className="block-title">
            <span>3</span>
            <div>
              <h2>Observações</h2>
              <p>Diga-nos o que podemos ter em conta ao preparar a sua proposta.</p>
            </div>
          </div>
          <label className="full-field">
            <textarea
              rows={4}
              value={client.notes}
              onChange={(e) => setClient({ ...client, notes: e.target.value })}
              placeholder="Ex.: crianças no grupo, mobilidade reduzida, horário preferido, celebração especial…"
            />
          </label>
        </div>
      </div>

      <aside className="proposal-summary">
        <div className="summary-card">
          <p className="eyebrow dark">RESUMO</p>
          <h2>{client.name || "Nova proposta"}</h2>
          <div className="summary-list">
            <div><span>Programas</span><strong>{items.length}</strong></div>
            <div><span>Participantes</span><strong>{client.people || "—"}</strong></div>
            <div><span>Data</span><strong>{client.date || "—"}</strong></div>
          </div>
          <div className="summary-total">
            <span>Total</span>
            <strong>{money(total)}</strong>
          </div>
          <div className="direct-proposal-note"><strong>Peça-nos uma proposta direta.</strong><span>Podemos preparar condições personalizadas para o seu grupo, de acordo com a data, os programas escolhidos e a disponibilidade.</span></div>
          <p className="summary-hint">Os valores apresentados servem de referência. A proposta final é confirmada pela Watermelon Experiences.</p>
          <button className="button button-primary wide" type="button" onClick={shareWhatsApp} disabled={!items.length}>
            Partilhar por WhatsApp
          </button>
          <button className="button button-outline wide" type="button" onClick={() => window.print()} disabled={!items.length}>
            Imprimir / Guardar PDF
          </button>
          <a className="button button-ghost wide" href="/#experiencias">Adicionar mais programas</a>
          {items.length > 0 && <button className="clear-link" type="button" onClick={clearProposal}>Começar de novo</button>}
        </div>
      </aside>

      <section className="print-proposal">
        <div className="print-brand">Watermelon Experiences</div>
        <h1>Proposta personalizada</h1>
        <div className="print-client">
          <p><strong>Cliente:</strong> {client.name || "—"}</p>
          <p><strong>Email:</strong> {client.email || "—"}</p>
          <p><strong>Telefone:</strong> {client.phone || "—"}</p>
          <p><strong>Data:</strong> {client.date || "—"}</p>
          <p><strong>Participantes:</strong> {client.people || "—"}</p>
        </div>
        {items.map((item, index) => (
          <div className="print-item" key={"print-" + item.code + "-" + index}>
            <span>{item.code}</span>
            <h3>{index + 1}. {item.title}</h3>
            <p>{item.optionName}</p>
            <p>{item.notes}</p>
            <strong>{item.price ? money(Number.parseFloat(item.price.replace(",", ".")) || 0) : "Sob consulta"}</strong>
          </div>
        ))}
        <div className="print-total"><span>Total</span><strong>{money(total)}</strong></div>
        {client.notes && <div className="print-notes"><strong>Observações</strong><p>{client.notes}</p></div>}
      </section>
    </section>
  );
}
