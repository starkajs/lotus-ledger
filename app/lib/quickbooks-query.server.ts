import type OAuthClient from "intuit-oauth";
import { getQuickBooksEnvironment } from "./env.server";
import { getAuthenticatedQuickBooksClient } from "./quickbooks-oauth.server";

const MINOR_VERSION = 65;
const PAGE_SIZE = 1000;

function getApiBaseUrl(): string {
  return getQuickBooksEnvironment() === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

/** Run a QuickBooks SQL query with pagination (STARTPOSITION / MAXRESULTS). */
export async function queryQuickBooksAll<T>(
  sql: string,
  responseKey: string,
): Promise<T[]> {
  const { client, tokens } = await getAuthenticatedQuickBooksClient();
  const base = getApiBaseUrl();
  const all: T[] = [];
  let startPosition = 1;

  for (;;) {
    const pageSql = `${sql} startposition ${startPosition} maxresults ${PAGE_SIZE}`;
    const query = encodeURIComponent(pageSql);
    const url = `${base}/v3/company/${tokens.realmId}/query?query=${query}&minorversion=${MINOR_VERSION}`;

    const response = await client.makeApiCall({
      url,
      method: "GET",
      headers: { Accept: "application/json" },
    });

    const body = response.json as Record<string, unknown>;
    const queryResponse = body.QueryResponse as Record<string, unknown> | undefined;
    const page = (queryResponse?.[responseKey] as T[] | undefined) ?? [];

    all.push(...page);

    if (page.length < PAGE_SIZE) break;
    startPosition += PAGE_SIZE;
  }

  return all;
}

export async function getQuickBooksRealmId(): Promise<string> {
  const { tokens } = await getAuthenticatedQuickBooksClient();
  return tokens.realmId;
}

export type { OAuthClient };
