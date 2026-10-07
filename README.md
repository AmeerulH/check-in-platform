# GTP Check-in

Standalone guest invitation and attendance app for GTP 2026. The canonical
architecture and decisions are in [docs/MASTER_SPEC.md](docs/MASTER_SPEC.md).

## Local preview

Run `npm install` and `npm run dev`, then open http://localhost:3000. Staff
pages require an allowlisted Google account. `DEV_PREVIEW_MODE=true` is for
local-only interface review; it must never be enabled in preview or production.

## Registration Sheet sync

The app reads `GTP2026 Registration Namelist` with a dedicated Google service
account. It uses the first visible tab whose columns A, C and E are NAME, EMAIL
and TICKETS, then reads every row in columns A–L. Set `GOOGLE_SHEETS_TAB` or
`GOOGLE_SHEETS_SPREADSHEET_ID` to override that lookup. Share the Sheet with
the service account email as a **viewer**, then set
`GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SHEETS_PRIVATE_KEY`
server-side. The private key may contain literal `\n` escapes. Set a random
`CRON_SECRET` in Vercel. Vercel invokes the sync at 00:00 UTC (08:00 Malaysia
time); organizers can use **Sheet sync → Sync now**. A failed read is stored
on the page as **Last error**.

Apply the versioned Supabase migration before enabling sync. A run imports new
emails and creates missing QR passes; updates to existing guests wait for
organizer review. It never removes guests or replaces active passes. The Sheet
registration ID is stored for reference only; normalized email is the unique
guest key. A failed pass appears in the run summary and can be repaired through
the guest action. Avoid running simultaneous syncs.

## 5 October email preparation

Each guest's **Share** action prepares their private registration link and QR
PNG for on-site guests. Online participants get their individual details without
a QR prompt. The participant guide is optional in the app; the team can attach its own
copy when sending. If the browser supports file sharing, the QR (and an uploaded
guide, if present) goes to the native share sheet. Gmail, Outlook and generic
`mailto:` compose links cannot attach downloaded files automatically, so Mijah
downloads the QR and attaches it in her chosen mail app, along with the guide.
Mark **Email sent** after sending; this is
a staff checklist, not provider delivery confirmation. No email is sent by the
site or by the scheduled sync.

## Checks

Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`. Test sharing on the
actual phone and desktop mail apps before the participant send.
