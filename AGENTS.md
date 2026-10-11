<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Quality gates

This app issues event passes and controls who gets checked in, so treat auth, tokens and database access as the highest-risk code. The skills named below are installed globally in `~/.agents/skills`. If one is unavailable, still follow the intent of the gate.

- **Before saying a change is done**, run `npm run lint`, `npm run typecheck` and `npm run build`, and report the actual output (`verification-before-completion`).
- **Bugs and failing checks:** find and state the root cause before changing code (`systematic-debugging`).
- **Before a PR or merge:** review the branch diff with `find-bugs` and `code-review`.
- **Security-sensitive changes** also get `differential-review` or `security-review`: `src/proxy.ts`, `src/lib/auth`, `src/lib/credentials.ts` and `src/lib/pass-issuer.ts`, every route under `src/app/api/` (check role and event scoping on each handler), `src/app/auth/callback`, `src/lib/supabase` and any service-role usage, `supabase/migrations` (RLS on every table, no broad `anon` grants, care with `security definer`), `scripts/bootstrap-admin.mjs`, and `vercel.json`.
- **Token or credential design changes:** run `sharp-edges` as well.
- **New actor, data flow or third-party integration:** update the threat model with `security-threat-model`.
- **Check-in, attendance and credential logic** should gain tests when touched; use `tdd`, and `property-based-testing` for token and parsing code (`src/lib/csv.ts`, `src/lib/registration-sheet.ts`).
- **New dependencies:** run `supply-chain-risk-auditor` before adding one.
