# MarksKoi

Course marks for BRAC University. Instructors keep marks in Google Sheets; MarksKoi syncs them
into PostgreSQL, instructors review and **publish** versioned results, and each student sees only
their own published marks.

- **Students** sign in with `@g.bracu.ac.bd` Google accounts and see all their enrolled courses.
- **Faculty** sign in with `@bracu.ac.bd` accounts, connect a spreadsheet, choose which columns
  students see, sync, preview as a student, and publish.
- **Administrators** (granted explicitly, never by email domain) manage roles, course
  assignments, sync health and the audit log. They do not see student marks.

## How it works

```
Google Sheets ──(service account, read-only)──▶ sync engine ──▶ marks (working copy)
                                                                     │  faculty clicks Publish
                                                                     ▼
Students ◀── only their own rows ◀── active publication snapshot (versioned, immutable)
```

- Syncing never changes what students see; publishing does. A failed or invalid sync keeps the
  last valid data.
- Worksheets are tracked by Google's stable `sheetId`; columns by header text. Renamed or
  ambiguous columns are flagged for review. MarksKoi never guesses.
- Blank cells are "not entered", never zero. `pending`, `excused`, `absent` are distinct states.
  Invalid values are reported with worksheet, row and column, and never imported.
- One sync per course at a time (database lease with fencing); writes are transactional and
  idempotent; Google calls use timeouts and retries with backoff.

## Tech stack

Next.js 16 (App Router, TypeScript strict) · Tailwind CSS 4 · shadcn/ui (Radix) · Motion ·
Auth.js v5 (Google, database sessions) · Prisma 6 + PostgreSQL (Supabase) · Google Sheets API ·
Vitest · Playwright · Netlify.

## Getting started

Requirements: Node.js 20.19+ or 22.11+ (22.12+ recommended), pnpm 9, Docker.

```bash
pnpm install
cp .env.example .env            # fill in values; see comments in the file
pnpm db:up                      # local Postgres 17 on :54329 (docker compose)
pnpm db:migrate                 # apply migrations
pnpm db:seed                    # optional demo data (requires SHEETS_DRIVER=fixture)
pnpm dev                        # http://localhost:3000
```

With `SHEETS_DRIVER=fixture`, spreadsheets are served from `fixtures/sheets.dev.json`, so you can
develop without Google credentials. Signing in still requires a Google OAuth client.

Create the first administrator (needs database access):

```bash
pnpm admin:grant someone@bracu.ac.bd ADMIN
```

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js development server / production build / serve build |
| `pnpm typecheck` | Generate route types and run `tsc` |
| `pnpm lint` | ESLint |
| `pnpm test:unit` | Pure logic tests (parsing, validation, permissions, sync planning) |
| `pnpm test:integration` | Database tests against `syncscore_test` (run `pnpm db:up` first) |
| `pnpm test:e2e` | Playwright journeys against `syncscore_e2e` on port 3100 |
| `pnpm db:migrate` / `pnpm db:deploy` | Create+apply migrations (dev) / apply migrations (prod) |
| `pnpm db:seed` | Demo data for local development |
| `pnpm admin:grant` / `admin:revoke` / `admin:list` | Manage roles from the command line |

## Project layout

```
prisma/                  schema and SQL migrations (incl. RLS hardening for Supabase)
src/app/                 routes: (public), (student), (faculty), (admin), api/
src/components/          UI kit, app shell, results sheet, shadcn/ui primitives
src/lib/                 client-safe helpers (normalization, schemas, mapping validation)
src/server/auth/         Auth.js config, adapter, sign-in policy, guards
src/server/authz/        permission predicates
src/server/sheets/       Google Sheets client (REST + fixture)
src/server/sync/         sync engine: build → resolve identities → plan → apply
src/server/services/     offerings, sources, sync, publication, student, admin, audit
netlify/functions/       scheduled sync (every 15 minutes)
tests/ e2e/              Vitest unit/integration and Playwright suites
```

## Deployment

Deploy to Netlify with a Supabase PostgreSQL database. Set the environment variables listed in
`.env.example` in Netlify (server-side only, never `NEXT_PUBLIC_`), run `pnpm db:deploy` against
the production database before deploying code that needs new migrations, and add
`https://YOUR_DOMAIN/api/auth/callback/google` to the Google OAuth client. The 15-minute
`netlify/functions/scheduled-sync.mts` calls `/api/cron/sync` with `CRON_SECRET`; a GitHub Actions
fallback lives in `.github/workflows/scheduled-sync.yml`.

## Security notes

- All authorization happens on the server for every page, action and API call; hidden links are
  never the only protection.
- No OAuth tokens are stored. Sessions are database-backed and revocable.
- The service-account key and all secrets stay in server environment variables.
- Supabase's Data API roles are denied access to every table (RLS enabled, privileges revoked).
- Report security issues privately to the maintainers rather than in public issues.
