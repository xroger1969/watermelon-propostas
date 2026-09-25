import type { Metadata } from "next";
import ProposalView from "@/components/ProposalView";

export const metadata: Metadata = {
  title: "Your proposal",
  description: "Review and respond to your personalized Watermelon Experiences proposal.",
  robots: { index: false, follow: false },
};

type ProposalPageProps = {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

export default async function ProposalPage({
  params,
  searchParams,
}: ProposalPageProps) {
  const { reference } = await params;
  const query = await searchParams;
  const token = Array.isArray(query.token) ? query.token[0] : query.token || "";

  return <ProposalView reference={reference} token={token} />;
}
