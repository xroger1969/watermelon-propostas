import ProposalBuilder from "@/components/ProposalBuilder";
import AIConcierge from "@/components/AIConcierge";

export const metadata = {
  title: "Request a proposal | Watermelon Experiences",
};

export default function ProposalPage() {
  const aiConciergeEnabled = Boolean(process.env.OPENAI_API_KEY);

  return (
    <main className="proposal-page">
      <section className="proposal-hero">
        <p className="eyebrow dark">PERSONALIZED PROPOSAL</p>
        <h1>Request your personalized proposal.</h1>
        <p>Choose the experiences you prefer and tell us about your trip. We will review your request and prepare a proposal tailored to you.</p>
      </section>
      {aiConciergeEnabled && <AIConcierge variant="proposal" />}
      <ProposalBuilder />
    </main>
  );
}
