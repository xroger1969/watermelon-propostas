export default function AdminAccessButton() {
  return (
    <a
      className="nav-admin-link"
      href="/admin"
      aria-label="Open the private Watermelon CRM"
      title="Private CRM"
    >
      <span className="nav-admin-lock" aria-hidden="true">🔒</span>
      <span className="nav-admin-text">Private CRM</span>
    </a>
  );
}
