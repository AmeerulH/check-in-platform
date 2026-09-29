import Link from "next/link";

import { getCurrentStaffMember } from "@/lib/auth/staff";
import { EVENT_DATES_LABEL } from "@/lib/event";

export default async function Home() {
  const staffMember = await getCurrentStaffMember();

  return (
    <main className="page-shell">
      <section className="hero-card">
        <p className="eyebrow">GTP 2026 · Internal platform</p>
        <h1>Guest check-in for GTP 2026</h1>
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

        <div className="home-actions">
          <Link className="button button-primary" href={staffMember ? "/dashboard" : "/login"}>
            {staffMember ? "Open dashboard" : "Staff sign in"}
          </Link>
          <p className="spec-link">For authorized conference staff</p>
        </div>
      </section>
    </main>
  );
}
