# GTP Guest Check-In

Standalone guest invitation and attendance platform for GTP 2026.

The canonical requirements and architecture are documented in
[`docs/MASTER_SPEC.md`](docs/MASTER_SPEC.md).

## Current phase

Phase 1 establishes the application foundation only:

- Next.js App Router with strict TypeScript
- Tailwind CSS
- typed environment boundaries
- approved QR generation and scanning dependencies
- lint, typecheck and production build scripts

Guest management, authentication, Supabase schema and check-in workflows are
not implemented in this phase.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Supabase values are not required to render the foundation page. They will be
required when backend integration begins.

## Quality checks

```bash
npm run lint
npm run typecheck
npm run build
```
