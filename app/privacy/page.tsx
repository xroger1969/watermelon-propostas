import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy Policy for Watermelon Experiences.",
  robots: { index: true, follow: true },
};

export default function PrivacyPolicyPage() {
  return (
    <main className="legal-page">
      <article className="legal-card">
        <p className="eyebrow dark">WATERMELON EXPERIENCES</p>
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: 25 September 2026</p>

        <section>
          <h2>1. Who we are</h2>
          <p>
            Watermelon Experiences provides private tours, food experiences,
            nature activities and personalized experiences in Portugal.
          </p>
        </section>

        <section>
          <h2>2. Information we collect</h2>
          <p>
            When you request a proposal, make a booking, contact us or use
            WhatsApp, we may collect your name, email address, telephone number,
            booking or travel details, preferences, messages and payment-related
            information necessary to manage your request.
          </p>
        </section>

        <section>
          <h2>3. How we use your information</h2>
          <p>
            We use personal information to answer enquiries, prepare proposals,
            manage bookings, communicate with you, arrange experiences, process
            or reconcile payments, provide customer support and maintain the
            security and operation of our services.
          </p>
        </section>

        <section>
          <h2>4. WhatsApp and Meta services</h2>
          <p>
            If you communicate with Watermelon Experiences through WhatsApp,
            your messages and related delivery information may be processed
            through Meta&apos;s WhatsApp Business Platform and our customer
            relationship management system so that we can manage the
            conversation and your request.
          </p>
        </section>

        <section>
          <h2>5. Sharing of information</h2>
          <p>
            We share information only when necessary to provide the requested
            service, for example with payment providers, technology providers
            and experience partners, or when required by law. We do not sell
            personal information.
          </p>
        </section>

        <section>
          <h2>6. Data retention and security</h2>
          <p>
            We retain information only for as long as reasonably necessary for
            the purposes described above, including legal, accounting and
            operational requirements, and use appropriate technical and
            organizational safeguards to protect it.
          </p>
        </section>

        <section>
          <h2>7. Your rights</h2>
          <p>
            Subject to applicable law, you may request access, correction or
            deletion of your personal information, or object to or restrict
            certain processing. You may also withdraw consent where processing
            is based on consent.
          </p>
        </section>

        <section>
          <h2>8. Contact</h2>
          <p>
            For privacy questions or requests, contact Watermelon Experiences
            through the contact details published on our official website.
          </p>
        </section>
      </article>
    </main>
  );
}
