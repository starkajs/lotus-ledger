import { eq, gte } from "drizzle-orm";
import { getDb } from "~/db";
import { products, stripeBalanceTransactions } from "~/db/schema";
import { listProducts } from "./products.server";

export const WEEKLY_DASHBOARD_WEEKS = 12;

export const UNMATCHED_BUCKET = "__unmatched__";
export const AMBIGUOUS_BUCKET = "__ambiguous__";

export type WeeklyBucketRow = {
  key: string;
  label: string;
};

export type WeeklyColumn = {
  weekStart: string;
  label: string;
};

export type WeeklyCellAmount = {
  currency: string;
  netMinor: number;
  count: number;
};

export type WeeklyProductDashboard = {
  weeks: WeeklyColumn[];
  buckets: WeeklyBucketRow[];
  /** buckets[key][weekStart] */
  cells: Record<string, Record<string, WeeklyCellAmount[]>>;
};

function weekStartMondayUtc(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = d.getUTCDay();
  const daysFromMonday = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysFromMonday);
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d: Date, withYear = false) =>
    d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      ...(withYear ? { year: "numeric" } : {}),
    });
  return `${fmt(start)} – ${fmt(end, true)}`;
}

function buildWeekColumns(count: number): WeeklyColumn[] {
  const now = new Date();
  const currentWeek = weekStartMondayUtc(now);
  const weeks: WeeklyColumn[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(`${currentWeek}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - i * 7);
    const weekStart = start.toISOString().slice(0, 10);
    weeks.push({
      weekStart,
      label: formatWeekLabel(weekStart),
    });
  }

  return weeks;
}

function resolveBucketKey(row: {
  productCode: string | null;
  productId: string | null;
  productMatchStatus: string | null;
}): string {
  if (row.productId && row.productCode) {
    return row.productCode;
  }
  if (row.productMatchStatus === "ambiguous") {
    return AMBIGUOUS_BUCKET;
  }
  return UNMATCHED_BUCKET;
}

function addToCell(
  cells: Record<string, Record<string, WeeklyCellAmount[]>>,
  bucketKey: string,
  weekStart: string,
  currency: string,
  net: number,
) {
  if (!cells[bucketKey]) cells[bucketKey] = {};
  if (!cells[bucketKey][weekStart]) cells[bucketKey][weekStart] = [];

  const list = cells[bucketKey][weekStart];
  const existing = list.find((c) => c.currency === currency);
  if (existing) {
    existing.netMinor += net;
    existing.count += 1;
  } else {
    list.push({ currency, netMinor: net, count: 1 });
  }
}

export async function getWeeklyNetByProductDashboard(): Promise<WeeklyProductDashboard> {
  const weeks = buildWeekColumns(WEEKLY_DASHBOARD_WEEKS);
  const earliestWeek = weeks[0]?.weekStart;
  if (!earliestWeek) {
    return { weeks: [], buckets: [], cells: {} };
  }

  const since = new Date(`${earliestWeek}T00:00:00Z`);

  const db = getDb();
  const rows = await db
    .select({
      net: stripeBalanceTransactions.net,
      currency: stripeBalanceTransactions.currency,
      stripeCreatedAt: stripeBalanceTransactions.stripeCreatedAt,
      productId: stripeBalanceTransactions.productId,
      productCode: products.code,
      productMatchStatus: stripeBalanceTransactions.productMatchStatus,
    })
    .from(stripeBalanceTransactions)
    .leftJoin(
      products,
      eq(stripeBalanceTransactions.productId, products.id),
    )
    .where(gte(stripeBalanceTransactions.stripeCreatedAt, since));

  const weekStarts = new Set(weeks.map((w) => w.weekStart));
  const cells: Record<string, Record<string, WeeklyCellAmount[]>> = {};

  for (const row of rows) {
    const weekStart = weekStartMondayUtc(row.stripeCreatedAt);
    if (!weekStarts.has(weekStart)) continue;

    const bucketKey = resolveBucketKey(row);
    addToCell(cells, bucketKey, weekStart, row.currency, row.net);
  }

  const catalog = await listProducts();
  const bucketKeysSeen = new Set(Object.keys(cells));

  const buckets: WeeklyBucketRow[] = [];

  for (const product of catalog) {
    buckets.push({ key: product.code, label: product.code });
    bucketKeysSeen.delete(product.code);
  }

  for (const key of bucketKeysSeen) {
    if (key === UNMATCHED_BUCKET || key === AMBIGUOUS_BUCKET) continue;
    buckets.push({ key, label: key });
  }

  buckets.push({ key: UNMATCHED_BUCKET, label: "Unmatched" });
  buckets.push({ key: AMBIGUOUS_BUCKET, label: "Ambiguous" });

  return { weeks, buckets, cells };
}
