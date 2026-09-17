import Link from "next/link";

import { getCurrentStaffMember } from "@/lib/auth/staff";
import { EVENT_DATES_LABEL } from "@/lib/event";

const foundations = [
  "Standalone Next.js application",
  "Dedicated Supabase backend boundary",
  "Mobile QR scanning with @zxing/browser",
  "Server-side QR generation with qrcode",
];

export default async function Home() {
  const staffMember = await getCurrentStaffMember();

  return (
    <main className="page-shell">
      <section className="hero-card">
        <p className="eyebrow">GTP 2026 · Internal platform</p>
        <h1>Guest check-in foundation</h1>
        <p className="lede">
          Manage guest passes, scan arrivals and monitor attendance for GTP
          2026 from one secure internal platform.
        </p>

        <dl className="event-details">
          <div>
            <dt>Event dates</dt>
            <dd>{EVENT_DATES_LABEL}</dd>
          </div>
          <div>
            <dt>Timezone</dt>
            <dd>Asia/Kuala_Lumpur</dd>
          </div>
        </dl>

        <ul className="foundation-list" aria-label="Configured foundations">
          {foundations.map((foundation) => (
            <li key={foundation}>{foundation}</li>
          ))}
        </ul>

        <div className="home-actions">
          <Link className="button button-primary" href={staffMember ? "/dashboard" : "/login"}>
            {staffMember ? "Open dashboard" : "Staff sign in"}
          </Link>
          <p className="spec-link">
            Architecture governed by the master specification
          </p>
        </div>
      </section>
    </main>
  );
}
