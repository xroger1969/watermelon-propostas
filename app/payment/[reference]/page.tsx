import type { Metadata } from "next";
import PaymentChoice from "@/components/PaymentChoice";

export const metadata: Metadata = {
  title: "Secure payment",
  description: "Choose how you would like to pay for your Watermelon Experience.",
  robots: {
    index: false,
    follow: false,
  },
};

type PaymentPageProps = {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

export default async function PaymentPage({
  params,
  searchParams,
}: PaymentPageProps) {
  const { reference } = await params;
  const query = await searchParams;
  const token = Array.isArray(query.token) ? query.token[0] : query.token || "";

  return <PaymentChoice reference={reference} token={token} />;
}
