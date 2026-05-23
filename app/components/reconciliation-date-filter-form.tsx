import { useEffect, useState } from "react";
import {
  DATE_PERIOD_LABELS,
  DATE_PERIOD_PRESETS,
  datePeriodPresetRange,
  formatCalendarDateShort,
  isDatePeriodPreset,
  type DatePeriodPreset,
} from "~/lib/date-range-filters";

type ReconciliationDateFilterFormProps = {
  dateFrom: string | null;
  dateTo: string | null;
  period: DatePeriodPreset | null;
  action?: string;
};

function datesFromProps(
  period: DatePeriodPreset | null,
  dateFrom: string | null,
  dateTo: string | null,
): { from: string; to: string } {
  if (period && isDatePeriodPreset(period)) {
    const range = datePeriodPresetRange(period);
    return { from: range.from, to: range.to };
  }
  return { from: dateFrom ?? "", to: dateTo ?? "" };
}

export function ReconciliationDateFilterForm({
  dateFrom,
  dateTo,
  period,
  action,
}: ReconciliationDateFilterFormProps) {
  const [periodValue, setPeriodValue] = useState(period ?? "");
  const initial = datesFromProps(period, dateFrom, dateTo);
  const [fromValue, setFromValue] = useState(initial.from);
  const [toValue, setToValue] = useState(initial.to);

  useEffect(() => {
    setPeriodValue(period ?? "");
    const next = datesFromProps(period, dateFrom, dateTo);
    setFromValue(next.from);
    setToValue(next.to);
  }, [period, dateFrom, dateTo]);

  const usingPreset =
    periodValue !== "" && isDatePeriodPreset(periodValue);

  function onPeriodChange(next: string) {
    setPeriodValue(next);
    if (next && isDatePeriodPreset(next)) {
      const range = datePeriodPresetRange(next);
      setFromValue(range.from);
      setToValue(range.to);
    }
  }

  return (
    <form method="get" action={action} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-0.5 text-xs">
        <span className="text-ink-muted">Period</span>
        <select
          name="period"
          value={periodValue}
          onChange={(e) => onPeriodChange(e.target.value)}
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
          name={usingPreset ? undefined : "from"}
          value={fromValue}
          onChange={(e) => setFromValue(e.target.value)}
          readOnly={usingPreset}
          required={!usingPreset}
          className={
            usingPreset
              ? "rounded-jamyang border border-sand-dark/60 bg-sand/30 px-2 py-1.5 text-sm cursor-default"
              : "rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
          }
        />
      </label>
      <label className="flex flex-col gap-0.5 text-xs">
        <span className="text-ink-muted">Date to</span>
        <input
          type="date"
          name={usingPreset ? undefined : "to"}
          value={toValue}
          onChange={(e) => setToValue(e.target.value)}
          readOnly={usingPreset}
          required={!usingPreset}
          className={
            usingPreset
              ? "rounded-jamyang border border-sand-dark/60 bg-sand/30 px-2 py-1.5 text-sm cursor-default"
              : "rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
          }
        />
      </label>
      <button
        type="submit"
        className="rounded-jamyang-pill border border-sand-dark/60 px-3 py-1.5 text-sm hover:bg-surface"
      >
        Run reconciliation
      </button>
    </form>
  );
}

export function ReconciliationDateFilterSummary({
  dateFrom,
  dateTo,
  period,
}: {
  dateFrom: string;
  dateTo: string;
  period: DatePeriodPreset | null;
}) {
  return (
    <p className="mt-2 text-xs text-ink-muted">
      {period ? (
        <>
          <span className="text-dark">{DATE_PERIOD_LABELS[period]}</span>
          <span className="text-ink-faint">
            {" "}
            ({formatCalendarDateShort(dateFrom)} – {formatCalendarDateShort(dateTo)})
          </span>
        </>
      ) : (
        <>
          {formatCalendarDateShort(dateFrom)} – {formatCalendarDateShort(dateTo)}
        </>
      )}
      <span className="text-ink-faint">
        {" "}
        · WC orders by order date, Stripe by transaction date (Europe/London)
      </span>
    </p>
  );
}
