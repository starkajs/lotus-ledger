# Database migrations (Drizzle)

Lotus Ledger uses [Drizzle Kit](https://orm.drizzle.team/kit-docs/overview) with SQL files in `drizzle/` and a migration journal in `drizzle/meta/_journal.json`.

## Why migrations sometimes “don’t run”

`npm run db:migrate` only applies migrations **listed in** `drizzle/meta/_journal.json`. Each entry’s `tag` must match a file `drizzle/<tag>.sql`.

If you add `drizzle/0027_foo.sql` by hand but forget the journal entry, migrate will report success while the database never changes. The app then fails at runtime with “column does not exist”.

This has happened when schema changes were made in `app/db/schema.ts` and SQL was written manually instead of using `db:generate`.

## Correct workflow (always use this)

1. Edit `app/db/schema.ts`.
2. Run:

   ```bash
   npm run db:generate
   ```

   This creates/updates:
   - `drizzle/NNNN_<name>.sql`
   - `drizzle/meta/_journal.json` (new entry)
   - `drizzle/meta/*_snapshot.json`

3. Commit **all three** together (schema + SQL + journal + snapshot).
4. Apply locally or on Fly:

   ```bash
   npm run db:migrate
   ```

## Do not

- Add `.sql` files under `drizzle/` without a matching journal entry.
- Edit `_journal.json` unless you know exactly what you are doing (prefer `db:generate`).

## Safety checks (automated)

- `npm run db:check` — fails if SQL files and journal are out of sync.
- `npm run typecheck` — runs `db:check` first.
- `npm run db:migrate` — runs `db:check` before applying migrations.

If `db:check` fails, fix the journal (or re-run `db:generate`) before migrating.

## Manual SQL (rare)

Only for data backfills that Drizzle Kit cannot express. Still required:

1. Add `drizzle/NNNN_<name>.sql` with `--> statement-breakpoint` between statements (match existing files).
2. Append to `drizzle/meta/_journal.json`:

   ```json
   {
     "idx": <next index>,
     "version": "7",
     "when": <unix ms>,
     "tag": "NNNN_<name>",
     "breakpoints": true
   }
   ```

3. Run `npm run db:check` then `npm run db:migrate`.
