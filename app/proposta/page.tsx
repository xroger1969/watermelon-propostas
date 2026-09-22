import ProposalBuilder from "@/components/ProposalBuilder";

export const metadata = {
  title: "Criar proposta | Watermelon Experiences",
};

export default function ProposalPage() {
  return (
    <main className="proposal-page">
      <section className="proposal-hero">
        <p className="eyebrow dark">PROPOSTA PERSONALIZADA</p>
        <h1>Monte a proposta do cliente.</h1>
        <p>Preencha os dados, ajuste valores e partilhe por WhatsApp ou imprima em PDF.</p>
      </section>
      <ProposalBuilder />
    </main>
  );
}
