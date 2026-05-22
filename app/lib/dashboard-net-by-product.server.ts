import { eq, gte } from "drizzle-orm";
import { getDb } from "~/db";
import { products, stripeBalanceTransactions } from "~/db/schema";
import { listProducts } from "./products.server";

export const DEFAULT_DASHBOARD_PERIODS = 6;
export const DEFAULT_DASHBOARD_GRANULARITY = "monthly" as const;

export const UNMATCHED_BUCKET = "__unmatched__";
export const AMBIGUOUS_BUCKET = "__ambiguous__";

export type DashboardGranularity = "daily" | "weekly" | "monthly";

const MAX_PERIODS: Record<DashboardGranularity, number> = {
  daily: 90,
  weekly: 52,
  monthly: 24,
};

export type DashboardBucketRow = {
  key: string;
  label: string;
};

export type DashboardPeriodColumn = {
  periodStart: string;
  label: string;
};

export type DashboardCellAmount = {
  currency: string;
  netMinor: number;
  count: number;
};

export type NetByProductDashboard = {
  granularity: DashboardGranularity;
  periods: number;
  columns: DashboardPeriodColumn[];
  buckets: DashboardBucketRow[];
  /** buckets[key][periodStart] */
  cells: Record<string, Record<string, DashboardCellAmount[]>>;
};

export type DashboardQueryParams = {
  granularity: DashboardGranularity;
  periods: number;
};

export function parseDashboardQueryParams(
  searchParams: URLSearchParams,
): DashboardQueryParams {
  const granularityRaw = searchParams.get("granularity");
  const granularity: DashboardGranularity =
    granularityRaw === "daily" ||
    granularityRaw === "weekly" ||
    granularityRaw === "monthly"
      ? granularityRaw
      : DEFAULT_DASHBOARD_GRANULARITY;

  const periodsRaw = Number(searchParams.get("periods") ?? DEFAULT_DASHBOARD_PERIODS);
  const max = MAX_PERIODS[granularity];
  const periods = Number.isFinite(periodsRaw)
    ? Math.min(max, Math.max(1, Math.floor(periodsRaw)))
    : DEFAULT_DASHBOARD_PERIODS;

  return { granularity, periods };
}

function utcDateOnly(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

function dayStartUtc(date: Date): string {
  return utcDateOnly(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  )
    .toISOString()
    .slice(0, 10);
}

function weekStartMondayUtc(date: Date): string {
  const d = utcDateOnly(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  const day = d.getUTCDay();
  const daysFromMonday = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysFromMonday);
  return d.toISOString().slice(0, 10);
}

function monthStartUtc(date: Date): string {
  return utcDateOnly(date.getUTCFullYear(), date.getUTCMonth(), 1)
    .toISOString()
    .slice(0, 10);
}

export function periodKeyFromDate(
  date: Date,
  granularity: DashboardGranularity,
): string {
  switch (granularity) {
    case "daily":
      return dayStartUtc(date);
    case "weekly":
      return weekStartMondayUtc(date);
    case "monthly":
      return monthStartUtc(date);
  }
}

function formatPeriodLabel(
  periodStart: string,
  granularity: DashboardGranularity,
): string {
  const start = new Date(`${periodStart}T00:00:00Z`);

  if (granularity === "daily") {
    return start.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  if (granularity === "monthly") {
    return start.toLocaleDateString("en-GB", {
      month: "short",
      year: "numeric",
    });
  }

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

function buildPeriodColumns(
  count: number,
  granularity: DashboardGranularity,
): DashboardPeriodColumn[] {
  const now = new Date();
  const anchor = periodKeyFromDate(now, granularity);
  const anchorDate = new Date(`${anchor}T00:00:00Z`);
  const columns: DashboardPeriodColumn[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(anchorDate);
    if (granularity === "daily") {
      d.setUTCDate(d.getUTCDate() - i);
    } else if (granularity === "weekly") {
      d.setUTCDate(d.getUTCDate() - i * 7);
    } else {
      d.setUTCMonth(d.getUTCMonth() - i);
    }

    const periodStart = periodKeyFromDate(d, granularity);
    columns.push({
      periodStart,
      label: formatPeriodLabel(periodStart, granularity),
    });
  }

  return columns;
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
  cells: Record<string, Record<string, DashboardCellAmount[]>>,
  bucketKey: string,
  periodStart: string,
  currency: string,
  net: number,
) {
  if (!cells[bucketKey]) cells[bucketKey] = {};
  if (!cells[bucketKey][periodStart]) cells[bucketKey][periodStart] = [];

  const list = cells[bucketKey][periodStart];
  const existing = list.find((c) => c.currency === currency);
  if (existing) {
    existing.netMinor += net;
    existing.count += 1;
  } else {
    list.push({ currency, netMinor: net, count: 1 });
  }
}

export async function getNetByProductDashboard(
  options: DashboardQueryParams,
): Promise<NetByProductDashboard> {
  const { granularity, periods } = options;
  const columns = buildPeriodColumns(periods, granularity);
  const earliest = columns[0]?.periodStart;

  if (!earliest) {
    return { granularity, periods, columns: [], buckets: [], cells: {} };
  }

  const since = new Date(`${earliest}T00:00:00Z`);

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

  const periodStarts = new Set(columns.map((c) => c.periodStart));
  const cells: Record<string, Record<string, DashboardCellAmount[]>> = {};

  for (const row of rows) {
    const periodStart = periodKeyFromDate(row.stripeCreatedAt, granularity);
    if (!periodStarts.has(periodStart)) continue;

    const bucketKey = resolveBucketKey(row);
    addToCell(cells, bucketKey, periodStart, row.currency, row.net);
  }

  const catalog = await listProducts();
  const bucketKeysSeen = new Set(Object.keys(cells));
  const productBuckets: DashboardBucketRow[] = [];

  for (const product of catalog) {
    productBuckets.push({ key: product.code, label: product.code });
    bucketKeysSeen.delete(product.code);
  }

  for (const key of bucketKeysSeen) {
    if (key === UNMATCHED_BUCKET || key === AMBIGUOUS_BUCKET) continue;
    productBuckets.push({ key, label: key });
  }

  productBuckets.sort((a, b) =>
    a.label.localeCompare(b.label, "en-GB", { sensitivity: "base" }),
  );

  const buckets: DashboardBucketRow[] = [
    ...productBuckets,
    { key: UNMATCHED_BUCKET, label: "Unmatched" },
    { key: AMBIGUOUS_BUCKET, label: "Ambiguous" },
  ];

  return { granularity, periods, columns, buckets, cells };
}
