import { getQuickBooksEnvironment } from "./env.server";
import { getAuthenticatedQuickBooksClient } from "./quickbooks-oauth.server";
import {
  getQuickBooksTokens,
  saveQuickBooksTokens,
} from "./quickbooks-tokens.server";

export type QuickBooksInvoiceSummary = {
  id: string;
  docNumber: string | null;
  txnDate: string | null;
  customerName: string | null;
  total: number;
  balance: number;
  currency: string | null;
};

export type QuickBooksCompanyInfo = {
  companyName: string;
  legalName: string | null;
  country: string | null;
  email: string | null;
};

function getApiBaseUrl(): string {
  return getQuickBooksEnvironment() === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

export async function verifyQuickBooksConnection(): Promise<{
  ok: boolean;
  realmId?: string;
  companyName?: string;
  environment: "sandbox" | "production";
  error?: string;
}> {
  const environment = getQuickBooksEnvironment();

  try {
    const stored = await getQuickBooksTokens();
    if (!stored) {
      return { ok: false, environment, error: "Not connected" };
    }

    const company = await fetchQuickBooksCompanyInfo();
    return {
      ok: true,
      realmId: stored.realmId,
      companyName: company.companyName,
      environment,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown QuickBooks error";
    return { ok: false, environment, error: message };
  }
}

export async function fetchQuickBooksCompanyInfo(): Promise<QuickBooksCompanyInfo> {
  const { client, tokens } = await getAuthenticatedQuickBooksClient();
  const base = getApiBaseUrl();
  const url = `${base}/v3/company/${tokens.realmId}/companyinfo/${tokens.realmId}?minorversion=65`;

  const response = await client.makeApiCall({
    url,
    method: "GET",
    headers: { Accept: "application/json" },
  });

  const body = response.json as {
    CompanyInfo?: {
      CompanyName?: string;
      LegalName?: string;
      Country?: string;
      Email?: { Address?: string };
    };
  };

  const info = body.CompanyInfo;
  const companyName = info?.CompanyName ?? "QuickBooks company";

  const stored = await getQuickBooksTokens();
  if (stored && stored.companyName !== companyName) {
    await saveQuickBooksTokens({ ...stored, companyName });
  }

  return {
    companyName,
    legalName: info?.LegalName ?? null,
    country: info?.Country ?? null,
    email: info?.Email?.Address ?? null,
  };
}

export async function fetchQuickBooksInvoices(
  limit = 25,
): Promise<QuickBooksInvoiceSummary[]> {
  const { client, tokens } = await getAuthenticatedQuickBooksClient();
  const base = getApiBaseUrl();
  const query = encodeURIComponent(
    `select * from Invoice orderby TxnDate desc maxresults ${Math.min(limit, 100)}`,
  );
  const url = `${base}/v3/company/${tokens.realmId}/query?query=${query}&minorversion=65`;

  const response = await client.makeApiCall({
    url,
    method: "GET",
    headers: { Accept: "application/json" },
  });

  const body = response.json as {
    QueryResponse?: {
      Invoice?: Array<{
        Id?: string;
        DocNumber?: string;
        TxnDate?: string;
        TotalAmt?: number;
        Balance?: number;
        CurrencyRef?: { value?: string };
        CustomerRef?: { name?: string };
      }>;
    };
  };

  const invoices = body.QueryResponse?.Invoice ?? [];

  return invoices.map((inv) => ({
    id: inv.Id ?? "",
    docNumber: inv.DocNumber ?? null,
    txnDate: inv.TxnDate ?? null,
    customerName: inv.CustomerRef?.name ?? null,
    total: inv.TotalAmt ?? 0,
    balance: inv.Balance ?? 0,
    currency: inv.CurrencyRef?.value ?? null,
  }));
}
