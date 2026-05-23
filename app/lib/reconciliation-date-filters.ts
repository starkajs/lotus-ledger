import {
  resolveOrderDateFilters,
  type DatePeriodPreset,
  type IsoDateString,
} from "~/lib/date-range-filters";

export type ReconciliationDateFilters = {
  dateFrom: IsoDateString | null;
  dateTo: IsoDateString | null;
  period: DatePeriodPreset | null;
};

export function parseReconciliationDateFiltersFromUrl(
  params: URLSearchParams,
): ReconciliationDateFilters {
  return resolveOrderDateFilters({
    period: params.get("period"),
    from: params.get("from"),
    to: params.get("to"),
  });
}

export function hasReconciliationDateRange(
  filters: ReconciliationDateFilters,
): filters is ReconciliationDateFilters & {
  dateFrom: IsoDateString;
  dateTo: IsoDateString;
} {
  return filters.dateFrom != null && filters.dateTo != null;
}

export function buildReconciliationSearchParams(
  filters: ReconciliationDateFilters,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.period) {
    params.set("period", filters.period);
  } else {
    if (filters.dateFrom) params.set("from", filters.dateFrom);
    if (filters.dateTo) params.set("to", filters.dateTo);
  }
  return params;
}

export function reconciliationHref(
  pathname: string,
  filters: ReconciliationDateFilters,
): string {
  const params = buildReconciliationSearchParams(filters);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
