import Catalog from "@/components/Catalog";
import AIConcierge from "@/components/AIConcierge";
import GuestReviews from "@/components/GuestReviews";

export default function Home() {
  const aiConciergeEnabled = Boolean(process.env.OPENAI_API_KEY);

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
            {aiConciergeEnabled ? (
              <>
                <a className="button button-primary" href="#ai-concierge">Plan my trip with AI ✦</a>
                <a className="hero-proposal-link" href="#experiencias">Prefer to browse? <strong>Explore experiences →</strong></a>
              </>
            ) : (
              <>
                <a className="button button-primary" href="#experiencias">Explore experiences</a>
                <a className="hero-proposal-link" href="/proposta">Looking for something tailored to you? <strong>Request a proposal →</strong></a>
              </>
            )}
          </div>
        </div>
      </section>

      {aiConciergeEnabled && <AIConcierge />}

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
      <GuestReviews />
    </main>
  );
}
