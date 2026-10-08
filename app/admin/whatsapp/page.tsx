import type { Metadata } from "next";
import WhatsAppSetup from "@/components/WhatsAppSetup";

export const metadata: Metadata = {
  title: "WhatsApp CRM",
  robots: { index: false, follow: false },
};

export default function WhatsAppSetupPage() {
  return (
    <main className="admin-page">
      <WhatsAppSetup />
    </main>
  );
}
