import { EVENT_DATES_LABEL } from "@/lib/event";

const foundations = [
  "Standalone Next.js application",
  "Dedicated Supabase backend boundary",
  "Mobile QR scanning with @zxing/browser",
  "Server-side QR generation with qrcode",
];

export default function Home() {
  return (
    <main className="page-shell">
      <section className="hero-card">
        <p className="eyebrow">GTP 2026 · Internal platform</p>
        <h1>Guest check-in foundation</h1>
        <p className="lede">
          The project foundation is ready. Guest management, staff access,
          scanning and attendance workflows will be introduced in reviewed
          implementation phases.
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

        <p className="spec-link">
          Architecture governed by the master specification
        </p>
      </section>
    </main>
  );
}
