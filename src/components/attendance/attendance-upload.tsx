"use client";

import { LoaderCircle } from "lucide-react";
import { useState } from "react";

import { emailsFromAttendanceText } from "@/lib/csv";

type ImportResult = {
  dryRun: boolean;
  date: string;
  received: number;
  matched: number;
  alreadyCheckedIn: number;
  newlyCheckedIn: number;
  unknownCount: number;
  inactiveCount: number;
  failedCount: number;
  unknown: string[];
  inactive: string[];
  failed: string[];
};

type ImportResponse = {
  data?: ImportResult;
  error?: { message?: string };
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-MY", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date(`${date}T12:00:00+08:00`));
}

export function AttendanceUpload({ eventDays }: { eventDays: string[] }) {
  const [date, setDate] = useState(eventDays[0] ?? "");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [previewKey, setPreviewKey] = useState("");
  const [message, setMessage] = useState("");
  const [isWorking, setIsWorking] = useState<"preview" | "commit" | null>(null);

  const currentKey = `${date}\n${text}`;
  const previewReady = result?.dryRun === true && previewKey === currentKey;

  async function submit(dryRun: boolean) {
    const emails = emailsFromAttendanceText(text);
    if (!date || !emails.length) {
      setMessage("Choose a day and add at least one email. Mark Y in the Checked in column when you upload a roster.");
      setResult(null);
      return;
    }

    setIsWorking(dryRun ? "preview" : "commit");
    setMessage("");
    try {
      const response = await fetch("/api/attendance/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, emails, dryRun }),
      });
      const body = (await response.json()) as ImportResponse;
      if (!response.ok || !body.data) {
        setResult(null);
        setMessage(body.error?.message ?? "We could not read this attendance list.");
        return;
      }
      setResult(body.data);
      if (dryRun) setPreviewKey(currentKey);
      else setPreviewKey("");
    } catch {
      setResult(null);
      setMessage("We could not reach the attendance service. Please try again.");
    } finally {
      setIsWorking(null);
    }
  }

  return (
    <section className="content-panel attendance-upload">
      <form onSubmit={(event) => {
        event.preventDefault();
        void submit(true);
      }}>
        <label>
          Event day
          <select onChange={(event) => setDate(event.target.value)} value={date}>
            {eventDays.map((eventDay) => (
              <option key={eventDay} value={eventDay}>{formatDate(eventDay)}</option>
            ))}
          </select>
        </label>
        <label>
          Attendance list
          <textarea
            onChange={(event) => setText(event.target.value)}
            placeholder={"One email per line, or paste a roster CSV.\nRows are imported when the Checked in column is Y, yes, x, or 1."}
            value={text}
          />
        </label>
        <label className="upload-file">
          CSV file
          <input
            accept=".csv,text/csv,text/plain"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (file.size > 1_000_000) {
                setMessage("This file is larger than 1 MB. Split it or paste the email column.");
                return;
              }
              setFileName(file.name);
              void file.text().then((contents) => {
                setText(contents);
                setResult(null);
                setMessage("");
              });
            }}
            type="file"
          />
        </label>
        {fileName && <p className="lookup-note">Loaded {fileName}. Preview before saving.</p>}
        <div className="heading-actions">
          <button className="button button-secondary" disabled={isWorking !== null} type="submit">
            {isWorking === "preview" && <LoaderCircle aria-hidden="true" className="spin" size={16} />}
            {isWorking === "preview" ? "Checking list…" : "Preview"}
          </button>
          <button
            className="button button-primary"
            disabled={!previewReady || isWorking !== null}
            onClick={() => void submit(false)}
            type="button"
          >
            {isWorking === "commit" && <LoaderCircle aria-hidden="true" className="spin" size={16} />}
            {isWorking === "commit" ? "Saving attendance…" : "Save attendance"}
          </button>
        </div>
      </form>
      {message && <p className="status-message status-error" role="alert">{message}</p>}
      {result && (
        <div>
          <h2>{result.dryRun ? "Preview" : "Saved"} for {formatDate(result.date)}</h2>
          <div className="import-summary">
            <article><span>Emails submitted</span><strong>{result.received}</strong></article>
            <article><span>{result.dryRun ? "Ready to check in" : "Newly checked in"}</span><strong>{result.newlyCheckedIn}</strong></article>
            <article><span>Already checked in</span><strong>{result.alreadyCheckedIn}</strong></article>
            <article><span>Not on the guest list</span><strong>{result.unknownCount}</strong></article>
            <article><span>Inactive guests</span><strong>{result.inactiveCount}</strong></article>
            {result.failedCount > 0 && <article><span>Could not save</span><strong>{result.failedCount}</strong></article>}
          </div>
          {result.unknownCount > 0 && (
            <div>
              <h3>Not matched</h3>
              <ul className="import-list">{result.unknown.map((email) => <li key={email}>{email}</li>)}</ul>
              {result.unknownCount > result.unknown.length && <p className="lookup-note">Showing the first {result.unknown.length}.</p>}
            </div>
          )}
          {result.inactiveCount > 0 && (
            <div>
              <h3>Inactive</h3>
              <ul className="import-list">{result.inactive.map((email) => <li key={email}>{email}</li>)}</ul>
            </div>
          )}
          {result.failedCount > 0 && (
            <div>
              <h3>Not saved</h3>
              <ul className="import-list">{result.failed.map((email) => <li key={email}>{email}</li>)}</ul>
            </div>
          )}
          {result.dryRun && result.newlyCheckedIn > 0 && (
            <p className="lookup-note">Nothing is saved yet. Save attendance to check these guests in.</p>
          )}
        </div>
      )}
    </section>
  );
}
