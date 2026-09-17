"use client";

import { Search } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import type { AttendanceLogItem, AttendanceLogPage } from "@/lib/attendance";
import { EVENT_TIMEZONE } from "@/lib/event";

type AttendanceLogProps = {
  eventDays: string[];
  initialPage: AttendanceLogPage;
};

type AttendanceResponse = {
  data?: AttendanceLogPage;
  error?: { message?: string };
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-MY", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: EVENT_TIMEZONE,
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${value}T12:00:00+08:00`));
}

export function AttendanceLog({ eventDays, initialPage }: AttendanceLogProps) {
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [date, setDate] = useState("");
  const [items, setItems] = useState<AttendanceLogItem[]>(initialPage.items);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [nextOffset, setNextOffset] = useState(initialPage.nextOffset);
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");

  const loadPage = useCallback(async (
    reset = false,
    filters?: { date: string; search: string },
  ) => {
    const offset = reset ? 0 : nextOffset;
    if (offset === null || loading) return;

    setLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams({ offset: String(offset) });
      const filterDate = filters?.date ?? date;
      const filterSearch = filters?.search ?? submittedSearch;
      if (filterDate) params.set("date", filterDate);
      if (filterSearch) params.set("search", filterSearch);
      const response = await fetch(`/api/attendance?${params}`);
      const body = (await response.json()) as AttendanceResponse;

      if (!response.ok || !body.data) {
        setMessage(body.error?.message ?? "We could not load more check-ins.");
        return;
      }

      setItems((currentItems) =>
        reset ? body.data!.items : [...currentItems, ...body.data!.items],
      );
      setNextOffset(body.data.nextOffset);
    } catch {
      setMessage("We could not load more check-ins. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [date, loading, nextOffset, submittedSearch]);

  useEffect(() => {
    const root = scrollRootRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || nextOffset === null) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadPage();
      },
      { root, rootMargin: "180px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadPage, nextOffset]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSearch = search.trim();
    setSubmittedSearch(nextSearch);
    setNextOffset(0);
    void loadPage(true, { date, search: nextSearch });
  }

  return (
    <section className="attendance-panel">
      <form className="attendance-filters" onSubmit={applyFilters}>
        <label className="search-field">
          <Search aria-hidden="true" size={18} />
          <span className="sr-only">Search guests</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search guest name or email"
            type="search"
            value={search}
          />
        </label>
        <label className="attendance-date-filter">
          <span className="sr-only">Filter by event date</span>
          <select onChange={(event) => setDate(event.target.value)} value={date}>
            <option value="">All event days</option>
            {eventDays.map((eventDay) => (
              <option key={eventDay} value={eventDay}>{formatDate(eventDay)}</option>
            ))}
          </select>
        </label>
        <button type="submit">Apply filters</button>
      </form>
      <div className="attendance-table-scroll" ref={scrollRootRef}>
        <table className="attendance-table">
          <thead>
            <tr>
              <th>Guest</th>
              <th>Event day</th>
              <th>Check-in</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.guestName}</strong>
                  <span>{item.guestEmail}</span>
                </td>
                <td>{formatDate(item.eventDate)}</td>
                <td>{formatTime(item.receivedAt)}</td>
                <td>
                  <span className={`status-badge status-${item.outcome}`}>
                    {item.outcome === "valid_first" ? "First arrival" : "Repeat scan"}
                  </span>
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">
                    <strong>No check-ins found</strong>
                    <span>Confirmed guest scans will appear here.</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div aria-live="polite" className="attendance-load-state" ref={sentinelRef}>
          {loading && "Loading more check-ins…"}
          {!loading && nextOffset !== null && items.length > 0 && "Scroll for more"}
          {message}
        </div>
      </div>
    </section>
  );
}
