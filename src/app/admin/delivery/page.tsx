import { Send } from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { requireStaffMember } from "@/lib/auth/staff";

export const dynamic = "force-dynamic";

const deliveries = [
  { name: "Aisha Rahman", channel: "Email", state: "Delivered", updated: "09:02" },
  { name: "Daniel Tan", channel: "Email", state: "Ready to send", updated: "—" },
  { name: "Mei Ling Lim", channel: "Manual link", state: "Copied", updated: "Yesterday" },
];

export default async function DeliveryPage() {
  const staffMember = await requireStaffMember(["organizer"]);

  return (
    <AppShell currentPath="/admin/delivery" staffMember={staffMember}>
      <div className="workspace">
        <header className="workspace-heading workspace-heading-actions">
          <div>
            <p className="eyebrow">Guest passes</p>
            <h1>Pass delivery</h1>
            <p>Track email and manual pass delivery without rotating a guest’s active QR.</p>
          </div>
          <button className="button button-primary" type="button">
            <Send aria-hidden="true" size={18} />
            Send ready passes
          </button>
        </header>
        <section className="content-panel">
          <div className="panel-heading">
            <div>
              <h2>Delivery activity</h2>
              <p>Delivery actions are preview-only until the QR pass workflow is connected.</p>
            </div>
            <span className="preview-chip">Preview data</span>
          </div>
          <ul className="delivery-list">
            {deliveries.map((delivery) => (
              <li key={delivery.name}>
                <div>
                  <strong>{delivery.name}</strong>
                  <span>{delivery.channel}</span>
                </div>
                <span className="status-badge status-delivered">{delivery.state}</span>
                <time>{delivery.updated}</time>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
