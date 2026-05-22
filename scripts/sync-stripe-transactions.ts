/**
 * Import Stripe balance transactions into stripe_balance_transactions.
 *
 * Usage:
 *   npm run sync:stripe-transactions
 *   npm run sync:stripe-transactions -- --connection <stripe-connection-uuid>
 *   npm run sync:stripe-transactions -- --days 30
 *   npm run sync:stripe-transactions -- --since 2024-01-01
 *
 * Optional env: STRIPE_SYNC_DAYS=30, STRIPE_SYNC_SINCE=2024-01-01 (used when flags omitted)
 */
import "dotenv/config";
import { closeDb } from "../app/db/index";
import {
  parseSyncSinceDate,
  syncStripeBalanceTransactions,
} from "../app/lib/sync-stripe-transactions.server";

const args = process.argv.slice(2);
const connectionFlag = args.indexOf("--connection");
const connectionId =
  connectionFlag >= 0 ? args[connectionFlag + 1] : undefined;

const daysFlag = args.indexOf("--days");
const daysFromArg =
  daysFlag >= 0 ? Number(args[daysFlag + 1]) : Number.NaN;
const daysFromEnv = Number(process.env.STRIPE_SYNC_DAYS ?? "");
const days = Number.isFinite(daysFromArg) && daysFromArg > 0
  ? Math.floor(daysFromArg)
  : Number.isFinite(daysFromEnv) && daysFromEnv > 0
    ? Math.floor(daysFromEnv)
    : undefined;

const sinceFlag = args.indexOf("--since");
const sinceRaw =
  sinceFlag >= 0
    ? args[sinceFlag + 1]
    : process.env.STRIPE_SYNC_SINCE?.trim() || undefined;

let since: Date | undefined;
if (sinceRaw) {
  try {
    since = parseSyncSinceDate(sinceRaw);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

if (connectionFlag >= 0 && !connectionId) {
  console.error(
    "Usage: npm run sync:stripe-transactions -- [--connection <uuid>] [--days <n>] [--since YYYY-MM-DD]",
  );
  process.exit(1);
}

if (daysFlag >= 0 && !days) {
  console.error("--days requires a positive number");
  process.exit(1);
}

if (sinceFlag >= 0 && !sinceRaw) {
  console.error("--since requires a date (YYYY-MM-DD)");
  process.exit(1);
}

if (since && days) {
  console.log("--since takes precedence over --days");
}

try {
  console.log("Syncing Stripe balance transactions…");
  if (connectionId) {
    console.log(`Stripe connection: ${connectionId}`);
  } else {
    console.log("Stripe connections: all saved accounts");
  }
  if (since) {
    console.log(`Date range: from ${sinceRaw} (UTC) onward`);
  } else if (days) {
    console.log(`Date range: last ${days} day(s) only`);
  } else {
    console.log("Date range: all available history");
  }

  const result = await syncStripeBalanceTransactions({ connectionId, days, since });

  console.log("\nDone.");
  console.log(`  Connections processed: ${result.connectionsProcessed}`);
  console.log(`  Created:               ${result.created}`);
  console.log(`  Updated:               ${result.updated}`);
  console.log(`  Skipped (not posted):  ${result.skippedNotPosted}`);
  console.log(`  Linked to community:   ${result.membersLinked}`);
  console.log(`  Classified:            ${result.classified}`);
  console.log(`  Skipped (manual):      ${result.classificationSkippedManual}`);
  if (result.since) {
    console.log(`  Since:                 ${sinceRaw ?? result.since}`);
  } else if (result.daysLimit) {
    console.log(`  Days limit:            ${result.daysLimit}`);
    if (result.stoppedAtCutoff) {
      console.log("  (Stopped at cutoff — older transactions skipped)");
    }
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await closeDb();
}
