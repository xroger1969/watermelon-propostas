import ProposalBuilder from "@/components/ProposalBuilder";

export const metadata = {
  title: "Criar proposta | Watermelon Experiences",
};

export default function ProposalPage() {
  return (
    <main className="proposal-page">
      <section className="proposal-hero">
        <p className="eyebrow dark">PROPOSTA PERSONALIZADA</p>
        <h1>Peça a sua proposta personalizada.</h1>
        <p>Escolha as experiências que prefere e indique os seus dados. Analisamos o pedido e preparamos uma proposta à sua medida.</p>
      </section>
      <ProposalBuilder />
    </main>
  );
}
