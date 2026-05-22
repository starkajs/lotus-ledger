import { sql, type SQL } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";

/** Calendar date as YYYY-MM-DD in the app reporting timezone. */
export type IsoDateString = string;

/** Matches en-GB list formatting and WooCommerce order date filters. */
export const APP_CALENDAR_TIMEZONE = "Europe/London";

export const DATE_PERIOD_PRESETS = [
  "this-week",
  "this-month",
  "last-week",
  "last-month",
  "this-year",
  "last-year",
] as const;

export type DatePeriodPreset = (typeof DATE_PERIOD_PRESETS)[number];

export function isDatePeriodPreset(value: string): value is DatePeriodPreset {
  return (DATE_PERIOD_PRESETS as readonly string[]).includes(value);
}

export function parseIsoDateParam(value: string | null | undefined): IsoDateString | null {
  if (!value?.trim()) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/** Calendar date (YYYY-MM-DD) for an instant in the given IANA timezone. */
export function calendarDateFromInstant(
  instant: Date,
  timeZone = APP_CALENDAR_TIMEZONE,
): IsoDateString {
  return calendarDateInZone(instant, timeZone);
}

function calendarDateInZone(instant: Date, timeZone: string): IsoDateString {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

function parseIsoParts(iso: IsoDateString): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function addCalendarDays(
  iso: IsoDateString,
  days: number,
  timeZone: string,
): IsoDateString {
  const { y, m, d } = parseIsoParts(iso);
  const instant = Date.UTC(y, m - 1, d, 12, 0, 0) + days * 86_400_000;
  return calendarDateInZone(new Date(instant), timeZone);
}

function weekdayIndexInZone(iso: IsoDateString, timeZone: string): number {
  const { y, m, d } = parseIsoParts(iso);
  const instant = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(instant);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[wd] ?? 0;
}

function mondayOnOrBefore(iso: IsoDateString, timeZone: string): IsoDateString {
  const dow = weekdayIndexInZone(iso, timeZone);
  const diff = dow === 0 ? -6 : 1 - dow;
  return addCalendarDays(iso, diff, timeZone);
}

function calendarToday(now: Date, timeZone: string): IsoDateString {
  return calendarDateInZone(now, timeZone);
}

export function datePeriodPresetRange(
  preset: DatePeriodPreset,
  now = new Date(),
  timeZone = APP_CALENDAR_TIMEZONE,
): { from: IsoDateString; to: IsoDateString } {
  const today = calendarToday(now, timeZone);
  const { y, m } = parseIsoParts(today);

  switch (preset) {
    case "this-week": {
      const from = mondayOnOrBefore(today, timeZone);
      return { from, to: today };
    }
    case "last-week": {
      const thisMonday = mondayOnOrBefore(today, timeZone);
      const from = addCalendarDays(thisMonday, -7, timeZone);
      const to = addCalendarDays(thisMonday, -1, timeZone);
      return { from, to };
    }
    case "this-month": {
      const from = `${y}-${String(m).padStart(2, "0")}-01`;
      return { from, to: today };
    }
    case "last-month": {
      const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
      const from = `${prev.y}-${String(prev.m).padStart(2, "0")}-01`;
      const to = addCalendarDays(
        `${y}-${String(m).padStart(2, "0")}-01`,
        -1,
        timeZone,
      );
      return { from, to };
    }
    case "this-year": {
      const from = `${y}-01-01`;
      return { from, to: today };
    }
    case "last-year": {
      const from = `${y - 1}-01-01`;
      const to = `${y - 1}-12-31`;
      return { from, to };
    }
  }
}

type TimestampColumn = AnyColumn | SQL;

/** Inclusive calendar range on a timestamptz column (Europe/London days). */
export function calendarDateCreatedGte(
  column: TimestampColumn,
  isoDate: IsoDateString,
) {
  return sql`(${column} AT TIME ZONE ${APP_CALENDAR_TIMEZONE})::date >= ${isoDate}::date`;
}

export function calendarDateCreatedLte(
  column: TimestampColumn,
  isoDate: IsoDateString,
) {
  return sql`(${column} AT TIME ZONE ${APP_CALENDAR_TIMEZONE})::date <= ${isoDate}::date`;
}

export function formatCalendarDateShort(
  iso: string,
  timeZone = APP_CALENDAR_TIMEZONE,
): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

export const DATE_PERIOD_LABELS: Record<DatePeriodPreset, string> = {
  "this-week": "This week",
  "this-month": "This month",
  "last-week": "Last week",
  "last-month": "Last month",
  "this-year": "This year",
  "last-year": "Last year",
};

export function resolveOrderDateFilters(input: {
  period?: string | null;
  from?: string | null;
  to?: string | null;
}): {
  dateFrom: IsoDateString | null;
  dateTo: IsoDateString | null;
  period: DatePeriodPreset | null;
} {
  const periodRaw = input.period?.trim() ?? "";
  if (periodRaw && isDatePeriodPreset(periodRaw)) {
    const range = datePeriodPresetRange(periodRaw);
    return { dateFrom: range.from, dateTo: range.to, period: periodRaw };
  }

  const dateFrom = parseIsoDateParam(input.from);
  const dateTo = parseIsoDateParam(input.to);
  return { dateFrom, dateTo, period: null };
}
