import { AppShell } from "@/components/app/app-shell";
import { requireStaffMember } from "@/lib/auth/staff";
import { previewRecentScans } from "@/lib/preview/demo-data";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Attendance dashboard",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ login?: string }>;
}) {
  const staffMember = await requireStaffMember();
  const { login } = await searchParams;

  return (
    <AppShell currentPath="/dashboard" staffMember={staffMember}>
      <div className="workspace">
        <header className="workspace-heading">
          <div>
            <p className="eyebrow">Wednesday, 14 October</p>
            <h1>Today’s attendance</h1>
          </div>
          <span className="preview-chip">Preview data</span>
        </header>
        {login === "success" && (
          <p className="status-message status-success" role="status">
            Signed in successfully. Your staff access is active.
          </p>
        )}
        <section aria-label="Attendance summary" className="metric-grid">
          <article>
            <span>Invited today</span>
            <strong>248</strong>
            <small>4 guest groups</small>
          </article>
          <article>
            <span>Checked in</span>
            <strong>183</strong>
            <small>73.8% attendance</small>
          </article>
          <article>
            <span>Not arrived</span>
            <strong>65</strong>
            <small>Last update moments ago</small>
          </article>
        </section>
        <section className="content-panel">
          <div className="panel-heading">
            <div>
              <h2>Recent activity</h2>
              <p>New and repeat scans appear here after server confirmation.</p>
            </div>
            <span className="connection-status">Live when connected</span>
          </div>
          <ol className="activity-list">
            {previewRecentScans.map((scan) => (
              <li key={`${scan.guest}-${scan.time}`}>
                <div className="activity-mark" aria-hidden="true" />
                <div>
                  <strong>{scan.guest}</strong>
                  <span>{scan.type} · {scan.scanner}</span>
                </div>
                <time>{scan.time}</time>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </AppShell>
  );
}
