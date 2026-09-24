import Catalog from "@/components/Catalog";

export default function Home() {
  return (
    <main>
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-logo-badge" aria-hidden="true">
            <img src="/watermelon-mark.svg" alt="" />
          </div>

          <p className="eyebrow">WATERMELON EXPERIENCES · PORTUGAL</p>
          <h1>Discover Portugal from a different perspective.</h1>
          <p className="hero-copy">
            Private tours, sea, beach, food and horseback riding experiences.
            Explore photos, duration and the current price shown on Viator.
          </p>

          <div className="hero-actions">
            <a className="button button-primary" href="#experiencias">Explore experiences</a>
            <a className="hero-proposal-link" href="/proposta">Looking for something tailored to you? <strong>Request a proposal →</strong></a>
          </div>
        </div>
      </section>

      <section className="intro">
        <div>
          <p className="eyebrow dark">WATERMELON COLLECTION</p>
          <h2>Find the right experience.</h2>
        </div>
        <p>
          Discover selected experiences in Portugal, compare options and find
          the program that best fits your trip.
        </p>
      </section>

      <Catalog />
    </main>
  );
}
