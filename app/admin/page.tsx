import type { Metadata } from "next";
import AdminBookings from "@/components/AdminBookings";

export const metadata: Metadata = {
  title: "Booking Admin | Watermelon Experiences",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <main className="admin-page">
      <AdminBookings />
    </main>
  );
}
