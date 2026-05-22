import {
  resolveOrderDateFilters,
  type DatePeriodPreset,
} from "~/lib/date-range-filters";
import type { QuickbooksPushFilter } from "~/lib/stripe-quickbooks.constants";

export const STRIPE_PRODUCT_MATCH_STATUSES = [
  "matched",
  "unmatched",
  "manual",
  "ambiguous",
] as const;

export type StripeProductMatchFilter =
  (typeof STRIPE_PRODUCT_MATCH_STATUSES)[number];

export type StripeTransactionListFilters = {
  account: string;
  pushed: QuickbooksPushFilter;
  product: "all" | StripeProductMatchFilter;
  dateFrom: string | null;
  dateTo: string | null;
  period: DatePeriodPreset | null;
};

export function appendStripeTransactionDateFilters(
  params: URLSearchParams,
  filters: Pick<
    StripeTransactionListFilters,
    "dateFrom" | "dateTo" | "period"
  >,
) {
  if (filters.period) {
    params.set("period", filters.period);
  } else {
    if (filters.dateFrom) params.set("from", filters.dateFrom);
    if (filters.dateTo) params.set("to", filters.dateTo);
  }
}

export function buildStripeTransactionsSearchParams(
  filters: StripeTransactionListFilters,
  page?: number,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.account) params.set("account", filters.account);
  if (filters.pushed !== "all") params.set("pushed", filters.pushed);
  if (filters.product !== "all") params.set("product", filters.product);
  appendStripeTransactionDateFilters(params, filters);
  if (page != null && page > 1) params.set("page", String(page));
  return params;
}

export function stripeTransactionsHref(
  pathname: string,
  filters: StripeTransactionListFilters,
  page?: number,
): string {
  const params = buildStripeTransactionsSearchParams(filters, page);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function parseStripeTransactionFiltersFromUrl(
  params: URLSearchParams,
  defaultAccount: string,
): StripeTransactionListFilters {
  const { dateFrom, dateTo, period } = resolveOrderDateFilters({
    period: params.get("period"),
    from: params.get("from"),
    to: params.get("to"),
  });
  const account = params.get("account") ?? defaultAccount;
  const pushedRaw = params.get("pushed");
  const pushed: StripeTransactionListFilters["pushed"] =
    pushedRaw === "yes" || pushedRaw === "no" || pushedRaw === "na"
      ? pushedRaw
      : "all";
  const productRaw = params.get("product");
  const product: StripeTransactionListFilters["product"] =
    productRaw &&
    (STRIPE_PRODUCT_MATCH_STATUSES as readonly string[]).includes(productRaw)
      ? (productRaw as StripeProductMatchFilter)
      : "all";
  return {
    account,
    pushed,
    product,
    dateFrom,
    dateTo,
    period,
  };
}

export function toListStripeBalanceTransactionOptions(
  filters: StripeTransactionListFilters,
  page?: number,
  pageSize?: number,
) {
  return {
    stripeConnectionId: filters.account || undefined,
    pushedToQuickbooks: filters.pushed,
    productMatch: filters.product,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    page,
    pageSize,
  };
}
