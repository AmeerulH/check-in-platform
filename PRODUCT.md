# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Authorized GTP and SCPH organizers manage invitees, secure QR passes and staff
access. Scanner staff use phones at the registration desk to confirm arrivals.
Viewers review the event’s attendance record. Guests receive a QR pass without
needing an application account.

## Product Purpose

Provide dependable, secure guest check-in for the GTP 2026 conference. Staff
must be able to create and resend a guest’s QR pass, scan it throughout the
four-day event, and see authoritative attendance results immediately.

## Positioning

This is a standalone, event-specific operations tool—not a public registration,
ticketing, or generic event-management product. It uses a reusable opaque QR
credential per guest, records repeat scans, and maintains an auditable daily
attendance record.

## Operating Context

- GTP 2026 runs 12–15 October in the Asia/Kuala_Lumpur timezone.
- The operational target is up to 500 guests and five concurrent scanners.
- Organizers may work at a desk; scanner staff primarily use mobile phones in
  time-sensitive, potentially intermittent-connectivity conditions.
- The platform is separate from the SCPH website, GTP marketing website, MPN,
  Sanity CMS and their databases.

## Capabilities and Constraints

- Next.js web app backed by a dedicated Supabase project and Vercel deployment.
- Approved staff email allowlist with organizer, scanner and viewer roles.
- Guest email is normalized and unique within the event.
- One active QR pass per guest is reusable over all event days; repeat scans
  are retained while daily attendance remains summarized.
- QR pass PNGs and direct links are private and organizer-accessible only.
- Realtime dashboard updates and a short offline retry queue support operations.
- Version 1 excludes public registration, payments, ticket sales, native apps,
  direct WhatsApp delivery and wallet passes.

## Brand Commitments

The product is named GTP Check-in. Its working voice is calm, capable and clear.
Avoid decorative dashboard tropes, noisy movement, ambiguous controls and
loading states that conceal whether an action is in progress.

## Evidence on Hand

- Canonical scope, architecture and workflow decisions: `docs/MASTER_SPEC.md`.
- The application’s live routes, authenticated staff workflows and local
  Supabase migrations are the current product demonstration.
- No approved photography, testimonials, partner claims or other promotional
  proof assets are available for future work to invent from.

## Product Principles

- Make the current task and system status apparent at a glance.
- Preserve user context and entered information while data is loading.
- Use compact, familiar product patterns that work under event-day pressure.
- Confirm server-authoritative outcomes clearly and immediately.
- Prefer quiet feedback over disruptive or ornamental motion.

## Accessibility & Inclusion

Meet WCAG 2.1 AA. All loading and error states must be conveyed with text in
addition to color, remain usable with keyboard navigation and respect reduced
motion preferences. Mobile phone use is a first-class workflow, with
touch-sized controls and responsive layouts that preserve core operations.
