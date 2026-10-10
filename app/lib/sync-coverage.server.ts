import { and, eq, gte } from "drizzle-orm";
import { getDb } from "~/db";
import { integrationJobRuns } from "~/db/schema";
import type { IntegrationJobType } from "~/lib/integration-jobs";

/** How far back a refresh will reach to fill a hole left by a missed sync. */
export const SYNC_GAP_HORIZON_DAYS = 120;

type Interval = { start: number; end: number };

function horizonStart(now: Date): Date {
  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - SYNC_GAP_HORIZON_DAYS);
  since.setUTCHours(0, 0, 0, 0);
  return since;
}

function parseInstant(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const parsed = dateOnly
    ? new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])))
    : new Date(value);
  const time = parsed.getTime();
  return Number.isFinite(time) ? time : null;
}

function coverageStart(result: Record<string, unknown> | null): number | null {
  if (!result) return null;
  return (
    parseInstant(result.createdGte) ??
    parseInstant(result.after) ??
    parseInstant(result.since) ??
    parseInstant(result.sinceDate)
  );
}

function connectionIdOf(options: Record<string, unknown>): string | null {
  const value = options.connectionId;
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Start of the earliest hole in completed sync coverage, within the last
 * 120 days. Null when those syncs already run through to now, or when there
 * is no completed sync to measure.
 */
export async function earliestUncoveredInstant(input: {
  jobType: IntegrationJobType;
  /** Limits which jobs count. A job with no connection id covers every id. */
  connectionIds?: string[];
  now?: Date;
}): Promise<Date | null> {
  const now = input.now ?? new Date();
  const horizon = horizonStart(now).getTime();
  const db = getDb();
  const rows = await db
    .select({
      finishedAt: integrationJobRuns.finishedAt,
      options: integrationJobRuns.options,
      result: integrationJobRuns.result,
    })
    .from(integrationJobRuns)
    .where(
      and(
        eq(integrationJobRuns.jobType, input.jobType),
        eq(integrationJobRuns.status, "completed"),
        gte(integrationJobRuns.finishedAt, new Date(horizon)),
      ),
    );

  const targets = input.connectionIds?.length ? input.connectionIds : [null];
  let earliest: number | null = null;

  for (const target of targets) {
    const intervals: Interval[] = [];
    for (const row of rows) {
      if (!row.finishedAt) continue;
      const jobConnection = connectionIdOf(row.options ?? {});
      if (target && jobConnection && jobConnection !== target) continue;
      const start = coverageStart(row.result ?? null);
      if (start == null) continue;
      intervals.push({ start, end: row.finishedAt.getTime() });
    }
    const gap = firstUncovered(intervals, horizon, now.getTime());
    if (gap != null && (earliest == null || gap < earliest)) earliest = gap;
  }

  return earliest == null ? null : new Date(earliest);
}

function firstUncovered(
  intervals: Interval[],
  horizon: number,
  now: number,
): number | null {
  const sorted = intervals
    .filter((interval) => interval.end > horizon && interval.start < now)
    .sort((a, b) => a.start - b.start);
  if (sorted.length === 0) return null;

  // Holes before the first completed sync are not treated as missing data.
  let cursor = sorted[0].start;
  for (const interval of sorted) {
    if (interval.end <= cursor) continue;
    if (interval.start > cursor + 1000) return cursor;
    cursor = Math.max(cursor, interval.end);
  }
  if (cursor < now - 1000) return cursor;
  return null;
}

/** Use the earlier of the requested window and a coverage hole. */
export function expandSyncStart(requested: Date, uncovered: Date | null): Date {
  if (!uncovered || uncovered >= requested) return requested;
  return uncovered;
}
