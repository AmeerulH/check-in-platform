"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type EventDay = { date: string; label: string };

export function ConferenceDaySwitcher({ days, selectedDate, children }: {
  days: EventDay[];
  selectedDate: string | null;
  children: React.ReactNode;
}) {
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const pendingDay = days.find((day) => day.date === pendingDate);

  return <>
    <nav aria-label="Conference day" className="day-tabs">
      {days.map((day) => <Link
        aria-current={selectedDate === day.date ? "page" : undefined}
        className={selectedDate === day.date ? "day-tab day-tab-active" : "day-tab"}
        href={`/dashboard?date=${day.date}`}
        key={day.date}
        onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || day.date === selectedDate) return;
          setPendingDate(day.date);
        }}
      >
        {pendingDate === day.date && <LoaderCircle aria-hidden="true" className="spin" size={16} />}
        {day.label}
      </Link>)}
    </nav>
    {pendingDay && <p className="dashboard-loading-message" role="status">Loading {pendingDay.label} attendance…</p>}
    <div aria-busy={Boolean(pendingDay)}>
      {pendingDay ? <DashboardLoadingState /> : children}
    </div>
  </>;
}

function DashboardLoadingState() {
  return <div aria-hidden="true">
    <section className="metric-grid dashboard-metric-skeleton">
      {Array.from({ length: 3 }, (_, index) => <article key={index}>
        <span className="skeleton" />
        <span className="skeleton" />
        <span className="skeleton" />
      </article>)}
    </section>
    <section className="content-panel dashboard-activity-skeleton">
      <div className="skeleton" />
      {Array.from({ length: 3 }, (_, index) => <div className="skeleton" key={index} />)}
    </section>
  </div>;
}
