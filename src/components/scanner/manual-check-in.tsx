"use client";

import { LoaderCircle, Search, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

import { deviceLabel } from "@/lib/scanner/device-label";

type LookupGuest = {
  id: string;
  displayName: string;
  email: string;
  organization: string | null;
  ticketType: string | null;
  checkedInToday: boolean;
};

type LookupResponse = {
  data?: LookupGuest[];
  error?: { message?: string };
};

type CheckInResponse = {
  data?: {
    guest_name: string;
    outcome: "valid_first" | "valid_repeat";
    already_processed: boolean;
  };
  error?: { message?: string };
};

export function ManualCheckIn() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LookupGuest[]>([]);
  const [searchError, setSearchError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "repeat" | "error">("success");

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setIsSearching(true);
      void fetch(`/api/check-in/lookup?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then(async (response) => {
          const body = (await response.json()) as LookupResponse;
          if (controller.signal.aborted) return;
          if (!response.ok || !body.data) {
            throw new Error(body.error?.message ?? "Guest search is unavailable.");
          }
          setResults(body.data);
          setSearchError("");
          setConfirmingId(null);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setSearchError(error instanceof Error ? error.message : "Guest search is unavailable.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsSearching(false);
        });
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [query]);

  async function checkIn(guest: LookupGuest) {
    setCheckingId(guest.id);
    setMessage("");
    try {
      const response = await fetch("/api/check-in/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestId: guest.id,
          clientScanId: crypto.randomUUID(),
          deviceLabel: deviceLabel(),
        }),
      });
      const body = (await response.json()) as CheckInResponse;
      if (!response.ok || !body.data) {
        setMessageTone("error");
        setMessage(body.error?.message ?? "We could not check in this guest. Please try again.");
        return;
      }
      const arrived = body.data.outcome === "valid_first" && !body.data.already_processed;
      setMessageTone(arrived ? "success" : "repeat");
      setMessage(arrived
        ? `${body.data.guest_name} is checked in.`
        : `${body.data.guest_name} has already checked in today.`);
      setResults((current) => current.map((item) => (
        item.id === guest.id ? { ...item, checkedInToday: true } : item
      )));
      setConfirmingId(null);
    } catch {
      setMessageTone("error");
      setMessage("We could not reach the check-in service. Please try again.");
    } finally {
      setCheckingId(null);
    }
  }

  const term = query.trim();

  return (
    <form className="manual-check-in" onSubmit={(event) => event.preventDefault()}>
      <label htmlFor="guest-lookup">
        <UserRound aria-hidden="true" size={16} />
        Find a guest
      </label>
      <div className="lookup-search">
        <Search aria-hidden="true" size={16} />
        <input
          id="guest-lookup"
          onChange={(event) => {
            setQuery(event.target.value);
            if (event.target.value.trim().length < 2) {
              setResults([]);
              setSearchError("");
            }
          }}
          placeholder="Name, email or organisation"
          type="search"
          value={query}
        />
      </div>
      {isSearching && <p className="lookup-note">Searching…</p>}
      {searchError && <p className="status-message status-error" role="alert">{searchError}</p>}
      {term.length >= 2 && !isSearching && !searchError && (
        <ul className="lookup-results">
          {results.map((guest) => (
            <li className="lookup-result" key={guest.id}>
              <strong>{guest.displayName}</strong>
              <span>{guest.email}</span>
              <span>{[guest.organization, guest.ticketType].filter(Boolean).join(" · ") || "Guest"}</span>
              {guest.checkedInToday && <span className="status-badge status-checked_in">Checked in today</span>}
              {confirmingId === guest.id ? (
                <span className="lookup-confirm">
                  <button disabled={checkingId === guest.id} onClick={() => void checkIn(guest)} type="button">
                    {checkingId === guest.id && <LoaderCircle aria-hidden="true" className="spin" size={16} />}
                    {checkingId === guest.id ? "Checking in…" : "Confirm check-in"}
                  </button>
                  <button disabled={checkingId === guest.id} onClick={() => setConfirmingId(null)} type="button">
                    Cancel
                  </button>
                </span>
              ) : (
                <button disabled={checkingId !== null} onClick={() => setConfirmingId(guest.id)} type="button">
                  Check in
                </button>
              )}
            </li>
          ))}
          {!results.length && <li className="lookup-note">No active guests match that search.</li>}
          {results.length === 10 && <li className="lookup-note">Showing the first 10 matches. Add more of the name or email to narrow it.</li>}
        </ul>
      )}
      {message && <p className={`status-message status-${messageTone === "error" ? "error" : "success"}`} role="status">{message}</p>}
    </form>
  );
}
