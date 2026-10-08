type PrivateSection = "bookings" | "whatsapp" | "promotions";

export default function PrivateAreaNav({ active }: { active: PrivateSection }) {
  const items: Array<{ id: PrivateSection | "crm" | "studio"; label: string; href: string; external?: boolean }> = [
    { id: "crm", label: "CRM dashboard", href: "/crm" },
    { id: "bookings", label: "Bookings & payments", href: "/admin/bookings" },
    { id: "whatsapp", label: "WhatsApp settings", href: "/admin/whatsapp" },
    { id: "promotions", label: "Website promotions", href: "/admin/promotions" },
    { id: "studio", label: "Product Studio ↗", href: "https://watermelon-product-studio.vercel.app/", external: true },
  ];
  return (
    <nav className="crm-workspace-nav" aria-label="Watermelon private area navigation">
      {items.map(item => (
        <a
          key={item.id}
          href={item.href}
          className={item.id === active ? "crm-nav-active" : undefined}
          aria-current={item.id === active ? "page" : undefined}
          target={item.external ? "_blank" : undefined}
          rel={item.external ? "noopener noreferrer" : undefined}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
