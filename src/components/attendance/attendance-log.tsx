"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { LoaderCircle, Search } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

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

async function fetchAttendancePage({
  date,
  offset,
  search,
}: {
  date: string;
  offset: number;
  search: string;
}) {
  const params = new URLSearchParams({ offset: String(offset) });
  if (date) params.set("date", date);
  if (search) params.set("search", search);
  const response = await fetch(`/api/attendance?${params}`);
  const body = (await response.json()) as AttendanceResponse;

  if (!response.ok || !body.data) {
    throw new Error(body.error?.message ?? "We could not load check-ins.");
  }

  return body.data;
}

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
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const isDefaultFilter = !date && !submittedSearch;
  const attendanceQuery = useInfiniteQuery({
    queryKey: ["attendance-log", { date, search: submittedSearch }],
    queryFn: ({ pageParam }) =>
      fetchAttendancePage({ date, search: submittedSearch, offset: pageParam }),
    initialPageParam: 0,
    initialData: isDefaultFilter
      ? { pages: [initialPage], pageParams: [0] }
      : undefined,
    getNextPageParam: (page) => page.nextOffset ?? undefined,
  });
  const items = attendanceQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const isFiltering = attendanceQuery.isLoading && !isDefaultFilter;

  useEffect(() => {
    const root = scrollRootRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || !attendanceQuery.hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !attendanceQuery.isFetchingNextPage) {
          void attendanceQuery.fetchNextPage();
        }
      },
      { root, rootMargin: "180px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    attendanceQuery.fetchNextPage,
    attendanceQuery.hasNextPage,
    attendanceQuery.isFetchingNextPage,
  ]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedSearch(search.trim());
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
        <button disabled={isFiltering} type="submit">
          {isFiltering && <LoaderCircle aria-hidden="true" className="spin" size={16} />}
          {isFiltering ? "Filtering…" : "Apply filters"}
        </button>
      </form>
      <div className="attendance-table-scroll" ref={scrollRootRef}>
        <table className={`attendance-table${!attendanceQuery.isLoading && !items.length ? " attendance-table-empty" : ""}`}>
          <thead>
            <tr>
              <th>Guest</th>
              <th>Event day</th>
              <th>Check-in</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {attendanceQuery.isLoading && (
              Array.from({ length: 6 }, (_, index) => (
                <tr className="table-skeleton-row" key={index}>
                  <td><span className="skeleton" /></td>
                  <td><span className="skeleton" /></td>
                  <td><span className="skeleton" /></td>
                  <td><span className="skeleton" /></td>
                </tr>
              ))
            )}
            {!attendanceQuery.isLoading && items.map((item) => (
              <tr key={item.id}>
                <td data-label="Guest">
                  <div className="attendance-guest-cell">
                    <strong>{item.guestName}</strong>
                    <span>{item.guestEmail}</span>
                  </div>
                </td>
                <td data-label="Event day">{formatDate(item.eventDate)}</td>
                <td data-label="Check-in">{formatTime(item.receivedAt)}</td>
                <td data-label="Result">
                  <span className={`status-badge status-${item.outcome}`}>
                    {item.outcome === "valid_first" ? "First arrival" : "Repeat scan"}
                  </span>
                </td>
              </tr>
            ))}
            {!attendanceQuery.isLoading && !items.length && (
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
          {attendanceQuery.isFetchingNextPage && "Loading more check-ins…"}
          {!attendanceQuery.isFetchingNextPage && attendanceQuery.hasNextPage && items.length > 0 && "Scroll for more"}
          {attendanceQuery.isError && (
            <button disabled={attendanceQuery.isRefetching} onClick={() => void attendanceQuery.refetch()} type="button">
              {attendanceQuery.isRefetching ? "Retrying…" : `${attendanceQuery.error.message} Retry`}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
