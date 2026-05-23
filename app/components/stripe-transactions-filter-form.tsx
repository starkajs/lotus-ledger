import {
  DATE_PERIOD_LABELS,
  DATE_PERIOD_PRESETS,
  type DatePeriodPreset,
} from "~/lib/date-range-filters";
import {
  STRIPE_PRODUCT_MATCH_STATUSES,
  type StripeProductMatchFilter,
} from "~/lib/stripe-transactions-filters";

type StripeTransactionsFilterFormProps = {
  account: string;
  connections: { id: string; label: string }[];
  pushed: "all" | "yes" | "no" | "na";
  product: "all" | StripeProductMatchFilter;
  dateFrom: string | null;
  dateTo: string | null;
  period: DatePeriodPreset | null;
  wcOrderSearch: string;
  wcLinked: "all" | "linked" | "not_linked";
  action?: string;
};

export function StripeTransactionsFilterForm({
  account,
  connections,
  pushed,
  product,
  dateFrom,
  dateTo,
  period,
  wcOrderSearch,
  wcLinked,
  action,
}: StripeTransactionsFilterFormProps) {
  return (
    <form method="get" action={action} className="flex flex-wrap items-end gap-2">
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
        {connections.length > 0 && (
          <label className="flex flex-col gap-0.5 text-xs">
            <span className="text-ink-muted">Stripe account</span>
            <select
              name="account"
              defaultValue={account}
              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
            >
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-0.5 text-xs">
          <span className="text-ink-muted">QuickBooks</span>
          <select
            name="pushed"
            defaultValue={pushed}
            className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
          >
            <option value="all">All</option>
            <option value="no">Not pushed</option>
            <option value="yes">Pushed</option>
            <option value="na">N/A</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-xs">
          <span className="text-ink-muted">Product</span>
          <select
            name="product"
            defaultValue={product}
            className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
          >
            <option value="all">All</option>
            {STRIPE_PRODUCT_MATCH_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-xs">
          <span className="text-ink-muted">WC order</span>
          <input
            type="search"
            name="wcOrder"
            defaultValue={wcOrderSearch}
            placeholder="Order key, WC order id, or #"
            className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm min-w-[10rem]"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs">
          <span className="text-ink-muted">WC link</span>
          <select
            name="wcLinked"
            defaultValue={wcLinked}
            className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
          >
            <option value="all">All</option>
            <option value="linked">Linked</option>
            <option value="not_linked">Not linked</option>
          </select>
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

export function StripeTransactionsFilterSummary({
  dateFrom,
  dateTo,
  period,
  product,
  wcOrderSearch,
  wcLinked,
}: {
  dateFrom: string | null;
  dateTo: string | null;
  period: DatePeriodPreset | null;
  product: "all" | StripeProductMatchFilter;
  wcOrderSearch: string;
  wcLinked: "all" | "linked" | "not_linked";
}) {
  if (
    !dateFrom &&
    !dateTo &&
    !period &&
    product === "all" &&
    !wcOrderSearch &&
    wcLinked === "all"
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
          Transaction date{" "}
          {dateFrom && dateTo
            ? `${dateFrom} – ${dateTo}`
            : dateFrom
              ? `from ${dateFrom}`
              : `to ${dateTo}`}
        </>
      ) : null}
      {product === "unmatched" && (
        <span className={dateFrom || dateTo || period ? " · " : ""}>
          Unmatched product only
        </span>
      )}
      {wcOrderSearch && (
        <span
          className={
            dateFrom || dateTo || period || product !== "all" ? " · " : ""
          }
        >
          WC order search: <span className="font-mono text-dark">{wcOrderSearch}</span>
        </span>
      )}
      {wcLinked !== "all" && (
        <span>
          {" "}
          · WC {wcLinked === "linked" ? "linked only" : "not linked"}
        </span>
      )}
    </p>
  );
}
