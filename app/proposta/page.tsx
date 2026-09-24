import ProposalBuilder from "@/components/ProposalBuilder";

export const metadata = {
  title: "Request a proposal | Watermelon Experiences",
};

export default function ProposalPage() {
  return (
    <main className="proposal-page">
      <section className="proposal-hero">
        <p className="eyebrow dark">PERSONALIZED PROPOSAL</p>
        <h1>Request your personalized proposal.</h1>
        <p>Choose the experiences you prefer and tell us about your trip. We will review your request and prepare a proposal tailored to you.</p>
      </section>
      <ProposalBuilder />
    </main>
  );
}
