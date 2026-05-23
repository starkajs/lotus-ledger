/**
 * Ensures every drizzle/*.sql migration is registered in drizzle/meta/_journal.json.
 * Drizzle's migrator ignores SQL files that are not in the journal — a common footgun
 * when migrations are hand-written instead of generated with `npm run db:generate`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const drizzleDir = path.join(root, "drizzle");
const journalPath = path.join(drizzleDir, "meta", "_journal.json");

const MIGRATION_FILE = /^\d{4}_[\w-]+\.sql$/;

export function checkDrizzleMigrations() {
  if (!fs.existsSync(journalPath)) {
    throw new Error(
      `Missing Drizzle journal: ${path.relative(root, journalPath)}\n` +
        "Run npm run db:generate after editing app/db/schema.ts.",
    );
  }

  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  const entries = journal.entries ?? [];
  const journalTags = entries.map((e) => e.tag);
  const journalTagSet = new Set(journalTags);

  const sqlTags = fs
    .readdirSync(drizzleDir)
    .filter((name) => MIGRATION_FILE.test(name))
    .map((name) => name.replace(/\.sql$/, ""));

  const sqlTagSet = new Set(sqlTags);

  const sqlWithoutJournal = sqlTags.filter((tag) => !journalTagSet.has(tag));
  const journalWithoutSql = journalTags.filter((tag) => !sqlTagSet.has(tag));

  const duplicateJournalTags = journalTags.filter(
    (tag, i) => journalTags.indexOf(tag) !== i,
  );

  const problems = [];

  if (sqlWithoutJournal.length > 0) {
    problems.push(
      "SQL files not registered in drizzle/meta/_journal.json (db:migrate will SKIP them):",
      ...sqlWithoutJournal.map(
        (tag) =>
          `  - drizzle/${tag}.sql → add a journal entry with "tag": "${tag}"`,
      ),
      "",
      "Fix: npm run db:generate  (preferred)",
      "  or manually append an entry to drizzle/meta/_journal.json",
    );
  }

  if (journalWithoutSql.length > 0) {
    problems.push(
      "Journal entries with no matching SQL file:",
      ...journalWithoutSql.map((tag) => `  - ${tag}`),
    );
  }

  if (duplicateJournalTags.length > 0) {
    problems.push(
      "Duplicate tags in drizzle/meta/_journal.json:",
      ...[...new Set(duplicateJournalTags)].map((tag) => `  - ${tag}`),
    );
  }

  if (problems.length > 0) {
    throw new Error(
      [
        "Drizzle migration journal is out of sync.",
        "",
        ...problems,
        "",
        "See docs/database-migrations.md",
      ].join("\n"),
    );
  }

  return { sqlCount: sqlTags.length, journalCount: journalTags.length };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    const { sqlCount } = checkDrizzleMigrations();
    console.log(`Drizzle migrations OK (${sqlCount} files, journal in sync).`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
