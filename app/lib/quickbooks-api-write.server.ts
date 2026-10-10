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

type QuickBooksWritableLine = {
  Id?: string;
  Description?: string;
  DetailType?: string;
  Amount?: number;
  SalesItemLineDetail?: Record<string, unknown>;
  [key: string]: unknown;
};

type QuickBooksReadEntity = {
  Id?: string;
  SyncToken?: string;
  Line?: QuickBooksWritableLine[];
};

function withUpdatedLineDescriptions(
  lines: QuickBooksWritableLine[],
  description: string,
): QuickBooksWritableLine[] {
  let updated = false;
  const next = lines.map((line) => {
    if (
      line.DetailType === "SalesItemLineDetail" ||
      line.SalesItemLineDetail != null
    ) {
      updated = true;
      return { ...line, Description: description };
    }
    return line;
  });
  if (!updated && next[0]) {
    next[0] = { ...next[0], Description: description };
  }
  return next;
}

/** True when a QuickBooks read says that entity was deleted (fault 610). */
export function quickBooksFaultMeansDeleted(raw: unknown): boolean {
  const seen = new Set<unknown>();
  const codes: string[] = [];
  const texts: string[] = [];

  const visit = (value: unknown, depth: number) => {
    if (depth > 6 || value == null || typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.code === "string" || typeof record.code === "number") {
      codes.push(String(record.code));
    }
    for (const key of ["Message", "Detail", "message", "detail"]) {
      if (typeof record[key] === "string") texts.push(record[key]);
    }
    for (const key of ["Fault", "Error", "json", "body", "authResponse", "response"]) {
      if (key in record) visit(record[key], depth + 1);
    }
  };

  visit(raw, 0);
  if (codes.includes("610")) return true;
  return texts.join(" ").toLowerCase().includes("has been deleted");
}

export type QuickBooksReceiptPresence =
  | { state: "present" }
  | { state: "absent" }
  | { state: "unknown"; message: string };

/** Live read of one Sales Receipt or Refund Receipt. */
export async function quickBooksReceiptPresence(input: {
  entity: "salesreceipt" | "refundreceipt";
  id: string;
}): Promise<QuickBooksReceiptPresence> {
  const current = await readQuickBooksEntity(input.entity, input.id);
  if (current.ok) return { state: "present" };
  if (quickBooksFaultMeansDeleted(current.raw)) return { state: "absent" };
  return { state: "unknown", message: current.message };
}

async function readQuickBooksEntity(
  entity: "salesreceipt" | "refundreceipt",
  id: string,
): Promise<
  | { ok: true; body: QuickBooksReadEntity; responseKey: "SalesReceipt" | "RefundReceipt" }
  | { ok: false; message: string; raw: unknown }
> {
  const { client, tokens } = await getAuthenticatedQuickBooksClient();
  const responseKey = entity === "salesreceipt" ? "SalesReceipt" : "RefundReceipt";
  const url = `${getApiBaseUrl()}/v3/company/${tokens.realmId}/${entity}/${encodeURIComponent(id)}?minorversion=${MINOR_VERSION}`;

  try {
    const response = await client.makeApiCall({
      url,
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const body = response.json as Record<string, QuickBooksReadEntity | undefined>;
    const entityBody = body[responseKey];
    if (!entityBody?.Id || entityBody.SyncToken == null) {
      return {
        ok: false,
        message: `QuickBooks did not return ${responseKey} ${id}`,
        raw: body,
      };
    }
    return { ok: true, body: entityBody, responseKey };
  } catch (err) {
    const raw = quickBooksErrorPayload(err) ?? { error: String(err) };
    return { ok: false, message: formatQuickBooksErrorMessage(err, raw), raw };
  }
}

/**
 * Rewrite the line description on an existing Sales Receipt or Refund Receipt.
 * Sends the receipt lines back with the new Description. It does not create
 * a second receipt.
 */
export async function updateQuickBooksReceiptDescription(input: {
  entity: "salesreceipt" | "refundreceipt";
  id: string;
  description: string;
}): Promise<
  | { ok: true; receipt: QuickBooksReadEntity; raw: unknown }
  | { ok: false; message: string; raw: unknown }
> {
  const current = await readQuickBooksEntity(input.entity, input.id);
  if (!current.ok) return current;

  const lines = current.body.Line ?? [];
  if (lines.length === 0) {
    return {
      ok: false,
      message: "QuickBooks receipt has no lines to update",
      raw: current.body,
    };
  }

  const { client, tokens } = await getAuthenticatedQuickBooksClient();
  const url = `${getApiBaseUrl()}/v3/company/${tokens.realmId}/${input.entity}?minorversion=${MINOR_VERSION}`;
  const payload = {
    Id: current.body.Id,
    SyncToken: current.body.SyncToken,
    sparse: true,
    Line: withUpdatedLineDescriptions(lines, input.description),
  };

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
    const body = response.json as Record<string, QuickBooksReadEntity | undefined>;
    const receipt = body[current.responseKey];
    if (!receipt?.Id) {
      return {
        ok: false,
        message: "QuickBooks did not return the updated receipt",
        raw: body,
      };
    }
    return { ok: true, receipt, raw: body };
  } catch (err) {
    const raw = quickBooksErrorPayload(err) ?? { error: String(err) };
    return { ok: false, message: formatQuickBooksErrorMessage(err, raw), raw };
  }
}

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
