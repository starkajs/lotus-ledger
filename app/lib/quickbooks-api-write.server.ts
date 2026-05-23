import { getQuickBooksEnvironment } from "~/lib/env.server";
import { getAuthenticatedQuickBooksClient } from "~/lib/quickbooks-oauth.server";
import type {
  QuickBooksSalesReceiptCreate,
  QuickBooksSalesReceiptCreateResponse,
} from "~/lib/quickbooks-sales-receipt-create";

const MINOR_VERSION = 65;

function getApiBaseUrl(): string {
  return getQuickBooksEnvironment() === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

/**
 * Create a Sales Receipt in QuickBooks.
 * POST /v3/company/{realmId}/salesreceipt?minorversion=65
 */
export async function createQuickBooksSalesReceipt(
  payload: QuickBooksSalesReceiptCreate,
): Promise<QuickBooksSalesReceiptCreateResponse["SalesReceipt"]> {
  const { client, tokens } = await getAuthenticatedQuickBooksClient();
  const url = `${getApiBaseUrl()}/v3/company/${tokens.realmId}/salesreceipt?minorversion=${MINOR_VERSION}`;

  const response = await client.makeApiCall({
    url,
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = response.json as QuickBooksSalesReceiptCreateResponse;
  if (!body?.SalesReceipt?.Id) {
    throw new Error("QuickBooks did not return a SalesReceipt Id");
  }
  return body.SalesReceipt;
}
