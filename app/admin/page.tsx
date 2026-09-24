import type { Metadata } from "next";
import AdminCRM from "@/components/AdminCRM";

export const metadata: Metadata = {
  title: "Watermelon CRM | Watermelon Experiences",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <main className="admin-page">
      <AdminCRM />
    </main>
  );
}
