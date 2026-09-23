import Image from "next/image";
import Catalog from "@/components/Catalog";

export default function Home() {
  return (
    <main>
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-logo-badge" aria-hidden="true">
            <Image
              src="/logo-icon.png"
              alt=""
              width={76}
              height={76}
              priority
            />
          </div>

          <p className="eyebrow">WATERMELON EXPERIENCES · PORTUGAL</p>
          <h1>Experiências para descobrir Portugal de outra forma.</h1>
          <p className="hero-copy">
            Tours privados, mar, praia, gastronomia e experiências a cavalo.
            Veja fotografias, duração e o preço atualmente apresentado na Viator.
          </p>

          <div className="hero-actions">
            <a className="button button-primary" href="#experiencias">Ver experiências</a>
            <a className="button button-light" href="/proposta">Pedir proposta personalizada</a>
          </div>
        </div>
      </section>

      <section className="intro">
        <div>
          <p className="eyebrow dark">CATÁLOGO WATERMELON</p>
          <h2>Escolha a experiência certa.</h2>
        </div>
        <p>
          Descubra experiências selecionadas em Portugal, compare opções e encontre
          o programa que melhor combina com a sua viagem.
        </p>
      </section>

      <Catalog />
    </main>
  );
}
