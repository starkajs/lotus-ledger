import {
  DATE_PERIOD_LABELS,
  DATE_PERIOD_PRESETS,
  type DatePeriodPreset,
} from "~/lib/date-range-filters";

type WooCommerceOrdersFilterFormProps = {
  status: string;
  statuses: string[];
  dateFrom: string | null;
  dateTo: string | null;
  period: DatePeriodPreset | null;
  lotusProductMissing: boolean;
  action?: string;
};

export function WooCommerceOrdersFilterForm({
  status,
  statuses,
  dateFrom,
  dateTo,
  period,
  lotusProductMissing,
  action,
}: WooCommerceOrdersFilterFormProps) {
  return (
    <form method="get" action={action} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-0.5 text-xs">
        <span className="text-ink-muted">Period</span>
        <select
          name="period"
          defaultValue={period ?? ""}
          className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm min-w-[10rem]"
        >
          <option value="">Custom range</option>
          {DATE_PERIOD_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {DATE_PERIOD_LABELS[preset]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-0.5 text-xs">
        <span className="text-ink-muted">Date from</span>
        <input
          type="date"
          name="from"
          defaultValue={dateFrom ?? ""}
          disabled={period != null}
          className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>
      <label className="flex flex-col gap-0.5 text-xs">
        <span className="text-ink-muted">Date to</span>
        <input
          type="date"
          name="to"
          defaultValue={dateTo ?? ""}
          disabled={period != null}
          className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>
      <label className="flex flex-col gap-0.5 text-xs">
        <span className="text-ink-muted">Status</span>
        <select
          name="status"
          defaultValue={status}
          className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
        >
          <option value="all">All</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 pb-1.5 text-xs text-ink-muted">
        <input
          type="checkbox"
          name="lotusMissing"
          value="yes"
          defaultChecked={lotusProductMissing}
          className="rounded border-sand-dark/60"
        />
        Lotus product missing
      </label>
      <button
        type="submit"
        className="rounded-jamyang-pill border border-sand-dark/60 px-3 py-1.5 text-sm hover:bg-surface"
      >
        Apply
      </button>
    </form>
  );
}

export function WooCommerceOrdersFilterSummary({
  dateFrom,
  dateTo,
  period,
  lotusProductMissing,
}: {
  dateFrom: string | null;
  dateTo: string | null;
  period: DatePeriodPreset | null;
  lotusProductMissing: boolean;
}) {
  if (!dateFrom && !dateTo && !period && !lotusProductMissing) return null;

  return (
    <p className="mt-2 text-xs text-ink-muted">
      {period ? (
        <>
          Showing <span className="text-dark">{DATE_PERIOD_LABELS[period]}</span>{" "}
          <span className="text-ink-faint">
            ({dateFrom} – {dateTo})
          </span>
        </>
      ) : dateFrom || dateTo ? (
        <>
          Order date{" "}
          {dateFrom && dateTo
            ? `${dateFrom} – ${dateTo}`
            : dateFrom
              ? `from ${dateFrom}`
              : `to ${dateTo}`}
        </>
      ) : null}
      {lotusProductMissing && (
        <span className={dateFrom || dateTo || period ? " · " : ""}>
          No linked Lotus product on any line
        </span>
      )}
    </p>
  );
}
