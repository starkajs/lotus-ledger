import { minorUnitsToMajor } from "~/lib/money";

/** Round to 2 decimal places for major-unit currency amounts. */
export function roundMoneyMajor(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Stripe balance `amount` is gross (what the customer paid, incl. VAT when applicable).
 * QuickBooks applies VAT on top of the line net, so send net on the line when VAT > 0.
 */
export function stripeGrossToQuickBooksLineAmount(input: {
  grossMinor: number;
  currency: string;
  vatRatePercent: number;
}): {
  grossMajor: number;
  lineAmountMajor: number;
  vatRatePercent: number;
} {
  const grossMajor = minorUnitsToMajor(input.grossMinor, input.currency);
  const vatRate = Math.max(0, input.vatRatePercent);

  if (vatRate <= 0) {
    return {
      grossMajor: roundMoneyMajor(grossMajor),
      lineAmountMajor: roundMoneyMajor(grossMajor),
      vatRatePercent: 0,
    };
  }

  const lineAmountMajor = roundMoneyMajor(
    grossMajor / (1 + vatRate / 100),
  );

  return {
    grossMajor: roundMoneyMajor(grossMajor),
    lineAmountMajor,
    vatRatePercent: vatRate,
  };
}
