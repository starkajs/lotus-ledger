import { getQuickBooksEnvironment } from "~/lib/env.server";
import { getAuthenticatedQuickBooksClient } from "~/lib/quickbooks-oauth.server";
import type {
  QuickBooksSalesReceiptCreate,
  QuickBooksSalesReceiptCreateResponse,
} from "~/lib/quickbooks-sales-receipt-create";
import type {
  QuickBooksRefundReceiptCreate,
  QuickBooksRefundReceiptCreateResponse,
} from "~/lib/quickbooks-refund-receipt-create";

const MINOR_VERSION = 65;

function getApiBaseUrl(): string {
  return getQuickBooksEnvironment() === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

function quickBooksErrorPayload(err: unknown): unknown {
  if (!err || typeof err !== "object") return null;
  const o = err as Record<string, unknown>;
  if (o.authResponse != null) return o.authResponse;
  if (o.json != null) return o.json;
  if (o.body != null) return o.body;
  return null;
}

function formatQuickBooksErrorMessage(err: unknown, raw: unknown): string {
  if (raw && typeof raw === "object") {
    const fault = (raw as { Fault?: { Error?: Array<{ Message?: string; Detail?: string }> } })
      .Fault;
    const first = fault?.Error?.[0];
    if (first?.Message) {
      return first.Detail ? `${first.Message} — ${first.Detail}` : first.Message;
    }
  }
  return err instanceof Error ? err.message : "QuickBooks API request failed";
}

export type QuickBooksSalesReceiptCreateOutcome =
  | {
      ok: true;
      salesReceipt: QuickBooksSalesReceiptCreateResponse["SalesReceipt"];
      raw: unknown;
    }
  | { ok: false; message: string; raw: unknown };

/**
 * Create a Sales Receipt in QuickBooks.
 * POST /v3/company/{realmId}/salesreceipt?minorversion=65
 */
export async function createQuickBooksSalesReceiptDetailed(
  payload: QuickBooksSalesReceiptCreate,
): Promise<QuickBooksSalesReceiptCreateOutcome> {
  const { client, tokens } = await getAuthenticatedQuickBooksClient();
  const url = `${getApiBaseUrl()}/v3/company/${tokens.realmId}/salesreceipt?minorversion=${MINOR_VERSION}`;

  try {
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
      return {
        ok: false,
        message: "QuickBooks did not return a SalesReceipt Id",
        raw: body,
      };
    }
    return { ok: true, salesReceipt: body.SalesReceipt, raw: body };
  } catch (err) {
    const raw = quickBooksErrorPayload(err) ?? { error: String(err) };
    return { ok: false, message: formatQuickBooksErrorMessage(err, raw), raw };
  }
}

export async function createQuickBooksSalesReceipt(
  payload: QuickBooksSalesReceiptCreate,
): Promise<QuickBooksSalesReceiptCreateResponse["SalesReceipt"]> {
  const result = await createQuickBooksSalesReceiptDetailed(payload);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.salesReceipt;
}

export type QuickBooksRefundReceiptCreateOutcome =
  | {
      ok: true;
      refundReceipt: QuickBooksRefundReceiptCreateResponse["RefundReceipt"];
      raw: unknown;
    }
  | { ok: false; message: string; raw: unknown };

/**
 * Create a Refund Receipt in QuickBooks.
 * POST /v3/company/{realmId}/refundreceipt?minorversion=65
 */
export async function createQuickBooksRefundReceiptDetailed(
  payload: QuickBooksRefundReceiptCreate,
): Promise<QuickBooksRefundReceiptCreateOutcome> {
  const { client, tokens } = await getAuthenticatedQuickBooksClient();
  const url = `${getApiBaseUrl()}/v3/company/${tokens.realmId}/refundreceipt?minorversion=${MINOR_VERSION}`;

  try {
    const response = await client.makeApiCall({
      url,
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const body = response.json as QuickBooksRefundReceiptCreateResponse;
    if (!body?.RefundReceipt?.Id) {
      return {
        ok: false,
        message: "QuickBooks did not return a RefundReceipt Id",
        raw: body,
      };
    }
    return { ok: true, refundReceipt: body.RefundReceipt, raw: body };
  } catch (err) {
    const raw = quickBooksErrorPayload(err) ?? { error: String(err) };
    return { ok: false, message: formatQuickBooksErrorMessage(err, raw), raw };
  }
}
