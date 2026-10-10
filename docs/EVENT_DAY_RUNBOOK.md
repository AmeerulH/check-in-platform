# Event-day runbook

Use this at the registration desk for Global Tipping Points, 12–15 October 2026.

## What the system can handle

A normal scan takes about 6–10 seconds per person: the guest opens the QR code, the camera reads it, and the server confirms the name. With the camera left on between guests, a scanner can check in about 6–10 people per minute.

Three queues with 2–3 phones each is 6–9 scanners, or about 36–90 people per minute. Four hundred guests is about 5–11 minutes of scanning if everyone is ready with a QR code, and longer while people find their pass.

The peak is about 1.5 check-in requests per second. Each request is one staff check and one database transaction. That is a small load for the hosted app and database.

The local stress test is `npm run loadtest`. It refuses to run unless the Supabase URL is on localhost, because the test writes 400 guests and their scans. This workspace is configured for the hosted database and Docker is not installed, so the test has not been measured here yet. Run it with `npx supabase start` before doors open. The pass line is no server errors, 400 attendance rows, a scan count that matches the requests sent, and a p95 under 1 second for the 9-scanner run.

The likely problems are the venue network, a slow path between the website host and the database, and phones losing signal. They are not the database filling up.

## Before doors open

- Apply the latest database migration, including manual and roster check-in.
- In the Vercel project, set `CHECK_IN_TEST_MODE` to `false`. Check-in stays in test mode unless that value is exactly `false`.
- Confirm the database region. Set the Vercel function region in `vercel.json` to the closest region, such as `sin1` when the database is in Singapore.
- Each scanner signs in the day before and completes one test scan.
- Each morning, an organizer downloads the roster from Check-ins onto two phones and prints one copy.
- Bring a venue hotspot, charged phones, and power banks.
- Keep at least two organizer accounts active.

## If something fails

1. **The phone briefly loses its connection.** Keep scanning. The pass is queued on that phone and sent again when the connection returns. The screen says the scan is queued. It does not say the guest is checked in until the server confirms. Queued scans are counted on the day they were scanned, as long as they upload within 72 hours.
2. **The QR code will not scan.** On the scanner page, search for the guest by name or email and confirm Check in. This works for organizers and scanners, and it is recorded in the audit log.
3. **The website or the network is down.** Use the printed or offline roster. Mark who arrived. When the site is back, an organizer opens Upload, chooses the event day, and uploads that roster. Only rows marked Y, yes, x, or 1 in the Checked in column are saved. Pasting a list of email addresses checks in every address on that list. Uploading the same file again does not double-count anyone.
4. **A queued scan cannot be saved.** It appears under Needs review with the reason. Dismiss it after the guest has been checked in manually or added to the paper roster.

Keep the scanner tab open during a short outage. A full page reload needs the network. If the page cannot load, switch to the paper roster.

## End of each day

- Open each scanner and confirm the pending count is zero.
- Resolve anything left under Needs review.
- Download the roster again and keep that file as the day’s snapshot.
- Confirm the next day’s phones are signed in and charged.
