import {
  APP_CALENDAR_TIMEZONE,
  calendarDateFromInstant,
  type IsoDateString,
} from "~/lib/date-range-filters";

/** Stripe transactions before this date (London) are not pushed to QuickBooks. */
export const STRIPE_QUICKBOOKS_NA_BEFORE: IsoDateString = "2026-04-01";

export type QuickbooksPushFilter = "all" | "yes" | "no" | "na";

export type QuickbooksPushStatus = "yes" | "no" | "na";

export function isStripeQuickbooksNa(stripeCreatedAt: Date | string): boolean {
  const instant =
    typeof stripeCreatedAt === "string"
      ? new Date(stripeCreatedAt)
      : stripeCreatedAt;
  return (
    calendarDateFromInstant(instant, APP_CALENDAR_TIMEZONE) <
    STRIPE_QUICKBOOKS_NA_BEFORE
  );
}

export function quickbooksPushStatus(
  pushed: boolean | null,
): QuickbooksPushStatus {
  if (pushed === null) return "na";
  return pushed ? "yes" : "no";
}

export function initialPushedToQuickbooks(
  stripeCreatedAt: Date | string,
): boolean | null {
  return isStripeQuickbooksNa(stripeCreatedAt) ? null : false;
}
