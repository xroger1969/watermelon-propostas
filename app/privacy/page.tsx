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
        <p className="legal-updated">Last updated: 30 September 2026</p>

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
          <h2>5. AI Concierge</h2>
          <p>
            If you use the Watermelon AI Concierge, the message you enter and
            relevant travel-planning context may be securely processed through
            the OpenAI API to generate suggestions from the Watermelon
            Experiences catalogue. Please avoid entering unnecessary sensitive
            personal information in the AI planner. If you explicitly ask the
            AI Concierge to request a quotation and provide the required contact
            details, Watermelon may save those contact details, the selected
            experience or tailor-made concept, travel details and relevant
            conversation context in its CRM so that our team can review and
            respond to your request. Watermelon configures OpenAI API requests
            without response storage in that API workflow, and OpenAI does not
            use API business inputs or outputs to train its models by default
            unless the account holder explicitly opts in.
          </p>
        </section>

        <section>
          <h2>6. Cookies, Google Ads and measurement</h2>
          <p>
            We use essential website technology and a Google tag for advertising
            measurement. Optional analytics and advertising storage are set to
            denied by default until you make a choice in our cookie preferences.
            If you grant permission, Google technology may use cookies or
            similar identifiers for measurement and, where applicable,
            advertising personalization. If you do not grant permission, Google
            tags may still send limited cookieless measurement signals in
            accordance with Google Consent Mode.
          </p>
          <p>
            If you allow Analytics, Watermelon also uses first-party measurement
            to count page views, sessions, approximate country, traffic source
            and successful proposal, booking or AI lead events. This measurement
            uses randomly generated visitor and session identifiers. We do not
            store your IP address in this analytics database, and first-party
            analytics events are automatically removed after 13 months.
          </p>
          <p>
            You can change your choice at any time by using the Cookie settings
            control shown on the website.
          </p>
        </section>

        <section>
          <h2>7. Sharing of information</h2>
          <p>
            We share information only when necessary to provide the requested
            service, for example with payment providers, technology providers
            and experience partners, or when required by law. We do not sell
            personal information.
          </p>
        </section>

        <section>
          <h2>8. Data retention and security</h2>
          <p>
            We retain information only for as long as reasonably necessary for
            the purposes described above, including legal, accounting and
            operational requirements, and use appropriate technical and
            organizational safeguards to protect it.
          </p>
        </section>

        <section>
          <h2>9. Your rights</h2>
          <p>
            Subject to applicable law, you may request access, correction or
            deletion of your personal information, or object to or restrict
            certain processing. You may also withdraw consent where processing
            is based on consent.
          </p>
        </section>

        <section>
          <h2>10. Contact</h2>
          <p>
            For privacy questions or requests, contact Watermelon Experiences
            through the contact details published on our official website.
          </p>
        </section>
      </article>
    </main>
  );
}
