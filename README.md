# GTP Check-in

Standalone guest invitation and attendance app for GTP 2026. The canonical
architecture and decisions are in [docs/MASTER_SPEC.md](docs/MASTER_SPEC.md).

## Local preview

Run `npm install` and `npm run dev`, then open http://localhost:3000. Staff
pages require an allowlisted Google account. `DEV_PREVIEW_MODE=true` is for
local-only interface review; it must never be enabled in preview or production.

## Registration Sheet sync

The app reads `GTP2026 Registration Namelist` → `Sheet1` with a dedicated
Google service account. Share the Sheet with its service account email as a
**viewer**, then set `GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL` and
`GOOGLE_SHEETS_PRIVATE_KEY` server-side. The private key may contain literal
`\n` escapes. Set a random `CRON_SECRET` in Vercel. Vercel invokes the sync at
00:00 UTC (08:00 Malaysia time); organizers can use **Sheet sync → Sync now**.

Apply the versioned Supabase migration before enabling sync. A run imports new
emails and creates missing QR passes; updates to existing guests wait for
organizer review. It never removes guests or replaces active passes. The Sheet
registration ID is stored for reference only; normalized email is the unique
guest key. A failed pass appears in the run summary and can be repaired through
the guest action. Avoid running simultaneous syncs.

## 5 October email preparation

Upload the approved participant-guide PDF in **Sheet sync**. Each guest's
**Share** action prepares their private registration link, QR PNG and the guide.
If the browser supports file sharing, both files go to the native share sheet.
Gmail, Outlook and generic `mailto:` compose links cannot attach downloaded
files automatically, so on unsupported devices Mijah downloads both files and
attaches them in her chosen mail app. Mark **Email sent** after sending; this is
a staff checklist, not provider delivery confirmation. No email is sent by the
site or by the scheduled sync.

## Checks

Run `npm run lint`, `npm run typecheck`, and `npm run build`. Test sharing on the
actual phone and desktop mail apps before the participant send.
