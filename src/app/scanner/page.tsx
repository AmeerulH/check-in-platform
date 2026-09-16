import { Camera, Keyboard, WifiOff } from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { requireStaffMember } from "@/lib/auth/staff";

export const dynamic = "force-dynamic";

export default async function ScannerPage() {
  const staffMember = await requireStaffMember(["organizer", "scanner"]);

  return (
    <AppShell currentPath="/scanner" staffMember={staffMember}>
      <div className="workspace scanner-workspace">
        <header className="workspace-heading">
          <div>
            <p className="eyebrow">Registration desk</p>
            <h1>Scan a guest pass</h1>
            <p>Hold the QR code inside the frame. A result is only confirmed after the server responds.</p>
          </div>
          <span className="connection-status">
            <WifiOff aria-hidden="true" size={16} />
            Preview offline state
          </span>
        </header>
        <section className="scanner-grid">
          <div className="scanner-frame">
            <Camera aria-hidden="true" size={40} strokeWidth={1.4} />
            <strong>Camera preview</strong>
            <span>Camera activation is added with the live check-in workflow.</span>
            <div className="scan-target" aria-hidden="true" />
          </div>
          <aside className="scanner-instructions">
            <h2>What happens next</h2>
            <ol>
              <li>The QR code is decoded on this device.</li>
              <li>The server checks the pass and today’s event status.</li>
              <li>The result confirms a first arrival, repeat or issue.</li>
            </ol>
            <button className="button button-secondary" type="button">
              <Keyboard aria-hidden="true" size={18} />
              Find guest manually
            </button>
          </aside>
        </section>
      </div>
    </AppShell>
  );
}
