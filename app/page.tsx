import Catalog from "@/components/Catalog";
import { experiences } from "@/data/products";

export default function Home() {
  return (
    <main>
      <section className="hero">
        <div className="hero-inner">
          <p className="eyebrow">PORTUGAL · EXPERIÊNCIAS PRIVADAS</p>
          <h1>Propostas turísticas feitas à medida.</h1>
          <p className="hero-copy">
            Escolha experiências Watermelon, combine vários programas e crie uma proposta
            simples para cada cliente.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#experiencias">Ver experiências</a>
            <a className="button button-light" href="/proposta">Abrir proposta</a>
          </div>
          <div className="hero-stats">
            <span><strong>{experiences.length}</strong> programas</span>
            <span><strong>100%</strong> catálogo Watermelon</span>
            <span><strong>Portugal</strong> Lisboa e além</span>
          </div>
        </div>
      </section>

      <section className="intro">
        <div>
          <p className="eyebrow dark">ESCOLHA, COMBINE, PROPONHA</p>
          <h2>Um catálogo comercial simples.</h2>
        </div>
        <p>
          Selecione um ou vários programas, escolha a opção pretendida e adicione-os à proposta.
          Os preços são preenchidos por si antes de enviar ao cliente.
        </p>
      </section>

      <Catalog products={experiences} />
    </main>
  );
}
