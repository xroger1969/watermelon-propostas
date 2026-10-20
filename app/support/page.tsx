import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "App Support",
  description: "Help, contact information and TestFlight feedback for the Watermelon Experiences iOS app.",
  robots: { index: true, follow: true },
};

export default function SupportPage() {
  return (
    <main className="legal-page">
      <article className="legal-card">
        <p className="eyebrow dark">WATERMELON EXPERIENCES</p>
        <h1>App Support</h1>
        <p>
          Need help with the Watermelon Experiences app? We can assist with
          experiences, personalized proposals, reservations and questions about
          using Watermelon AI.
        </p>

        <section>
          <h2>Contact our team</h2>
          <p>
            Email us at{" "}
            <a href="mailto:info@watermelonexperiences.pt?subject=Watermelon%20Experiences%20App%20Support">
              info@watermelonexperiences.pt
            </a>
            . Please describe the issue and, if relevant, mention your iPhone
            model and app version. Do not send passwords or payment card details.
          </p>
        </section>

        <section>
          <h2>Reservations and proposals</h2>
          <p>
            If you need to change a reservation, have a question about a price,
            or want help with a proposal, contact us by email and include the
            relevant booking or proposal reference if you have one.
          </p>
        </section>

        <section>
          <h2>TestFlight beta feedback</h2>
          <p>
            If you are testing an early version of the app through Apple
            TestFlight, you can send feedback through TestFlight or contact us
            using the email address above. Please explain what you were doing
            when the problem occurred and what you expected to happen.
          </p>
        </section>

        <section>
          <h2>Privacy</h2>
          <p>
            Learn how we handle personal information in our{" "}
            <a href="/privacy">Privacy Policy</a>.
          </p>
        </section>
      </article>
    </main>
  );
}
