import type { DatePeriodPreset } from "~/lib/date-range-filters";

export type WooCommerceOrderListFilters = {
  status: string;
  dateFrom: string | null;
  dateTo: string | null;
  period: DatePeriodPreset | null;
  lotusProductMissing: boolean;
};

export function appendWooCommerceOrderDateFilters(
  params: URLSearchParams,
  filters: WooCommerceOrderListFilters,
) {
  if (filters.period) {
    params.set("period", filters.period);
  } else {
    if (filters.dateFrom) params.set("from", filters.dateFrom);
    if (filters.dateTo) params.set("to", filters.dateTo);
  }
}

export function buildWooCommerceOrdersSearchParams(
  filters: WooCommerceOrderListFilters,
  page?: number,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.status !== "all") params.set("status", filters.status);
  appendWooCommerceOrderDateFilters(params, filters);
  if (filters.lotusProductMissing) params.set("lotusMissing", "yes");
  if (page != null && page > 1) params.set("page", String(page));
  return params;
}

export function wooCommerceOrdersHref(
  pathname: string,
  filters: WooCommerceOrderListFilters,
  page?: number,
): string {
  const params = buildWooCommerceOrdersSearchParams(filters, page);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
