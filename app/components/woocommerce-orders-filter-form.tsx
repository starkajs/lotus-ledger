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
  stripeSearch: string;
  stripeLinked: "all" | "linked" | "not_linked";
  action?: string;
};

export function WooCommerceOrdersFilterForm({
  status,
  statuses,
  dateFrom,
  dateTo,
  period,
  lotusProductMissing,
  stripeSearch,
  stripeLinked,
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
      <label className="flex items-center gap-2 pb-1.5 text-xs text-ink-muted">
        <input
          type="checkbox"
          name="stripeNotLinked"
          value="yes"
          defaultChecked={stripeLinked === "not_linked"}
          className="rounded border-sand-dark/60"
        />
        Not linked to Stripe
      </label>
      <label className="flex flex-col gap-0.5 text-xs">
        <span className="text-ink-muted">Stripe</span>
        <input
          type="search"
          name="stripe"
          defaultValue={stripeSearch}
          placeholder="Order key, WC #, or txn id"
          className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm min-w-[10rem]"
        />
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
  stripeSearch,
  stripeLinked,
}: {
  dateFrom: string | null;
  dateTo: string | null;
  period: DatePeriodPreset | null;
  lotusProductMissing: boolean;
  stripeSearch: string;
  stripeLinked: "all" | "linked" | "not_linked";
}) {
  if (
    !dateFrom &&
    !dateTo &&
    !period &&
    !lotusProductMissing &&
    !stripeSearch &&
    stripeLinked === "all"
  ) {
    return null;
  }

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
      {stripeSearch && (
        <span>
          {" "}
          · Stripe search:{" "}
          <span className="font-mono text-dark">{stripeSearch}</span>
        </span>
      )}
      {stripeLinked === "not_linked" && (
        <span> · Not linked to Stripe</span>
      )}
      {stripeLinked === "linked" && (
        <span> · Linked to Stripe only</span>
      )}
    </p>
  );
}
