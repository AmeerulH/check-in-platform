import { AppShell } from "@/components/app/app-shell";
import { requireStaffMember } from "@/lib/auth/staff";
import { CheckInScanner } from "@/components/scanner/check-in-scanner";

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
        </header>
        <CheckInScanner />
      </div>
    </AppShell>
  );
}
