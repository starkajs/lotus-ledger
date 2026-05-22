/** Calendar date as YYYY-MM-DD (UTC). */
export type IsoDateString = string;

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

function toIsoDateUtc(date: Date): IsoDateString {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function utcToday(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Monday 00:00 UTC of the week containing `date`. */
function mondayUtc(date: Date): Date {
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + diff),
  );
}

function addDaysUtc(date: Date, days: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days),
  );
}

export function datePeriodPresetRange(
  preset: DatePeriodPreset,
  now = new Date(),
): { from: IsoDateString; to: IsoDateString } {
  const today = utcToday(now);
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();

  switch (preset) {
    case "this-week": {
      const from = mondayUtc(today);
      return { from: toIsoDateUtc(from), to: toIsoDateUtc(today) };
    }
    case "last-week": {
      const thisMonday = mondayUtc(today);
      const from = addDaysUtc(thisMonday, -7);
      const to = addDaysUtc(thisMonday, -1);
      return { from: toIsoDateUtc(from), to: toIsoDateUtc(to) };
    }
    case "this-month": {
      const from = new Date(Date.UTC(y, m, 1));
      return { from: toIsoDateUtc(from), to: toIsoDateUtc(today) };
    }
    case "last-month": {
      const from = new Date(Date.UTC(y, m - 1, 1));
      const to = new Date(Date.UTC(y, m, 0));
      return { from: toIsoDateUtc(from), to: toIsoDateUtc(to) };
    }
    case "this-year": {
      const from = new Date(Date.UTC(y, 0, 1));
      return { from: toIsoDateUtc(from), to: toIsoDateUtc(today) };
    }
    case "last-year": {
      const from = new Date(Date.UTC(y - 1, 0, 1));
      const to = new Date(Date.UTC(y - 1, 11, 31));
      return { from: toIsoDateUtc(from), to: toIsoDateUtc(to) };
    }
  }
}

/** Inclusive calendar range → DB bounds on `date_created` (UTC day boundaries). */
export function dateRangeToCreatedBounds(range: {
  from: IsoDateString | null;
  to: IsoDateString | null;
}): { createdGte?: Date; createdLt?: Date } {
  const result: { createdGte?: Date; createdLt?: Date } = {};
  if (range.from) {
    const [y, m, d] = range.from.split("-").map(Number);
    result.createdGte = new Date(Date.UTC(y, m - 1, d));
  }
  if (range.to) {
    const [y, m, d] = range.to.split("-").map(Number);
    result.createdLt = new Date(Date.UTC(y, m - 1, d + 1));
  }
  return result;
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
