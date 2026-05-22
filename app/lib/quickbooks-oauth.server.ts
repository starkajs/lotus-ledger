import { createHmac, randomBytes } from "node:crypto";
import OAuthClient from "intuit-oauth";
import {
  getAppUrl,
  getOAuthStateSecret,
  getQuickBooksClientId,
  getQuickBooksClientSecret,
  getQuickBooksEnvironment,
} from "./env.server";
import {
  getQuickBooksTokens,
  saveQuickBooksTokens,
  type QuickBooksTokenStore,
} from "./quickbooks-tokens.server";

const OAUTH_STATE_COOKIE = "quickbooks_oauth_state";
const STATE_MAX_AGE_SECONDS = 600;

export function createOAuthClient(token?: QuickBooksTokenStore): OAuthClient {
  const clientId = getQuickBooksClientId();
  const clientSecret = getQuickBooksClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("QuickBooks client id and secret are not configured");
  }

  const client = new OAuthClient({
    clientId,
    clientSecret,
    environment: getQuickBooksEnvironment(),
    redirectUri: getQuickBooksRedirectUri(),
  });

  if (token) {
    client.setToken({
      realmId: token.realmId,
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      token_type: token.token_type,
      expires_in: token.expires_in,
      x_refresh_token_expires_in: token.x_refresh_token_expires_in,
      createdAt: token.createdAt,
    });
  }

  return client;
}

export function getQuickBooksRedirectUri(): string {
  return `${getAppUrl()}/integrations/quickbooks/callback`;
}

export function createOAuthState(): string {
  const nonce = randomBytes(16).toString("hex");
  const issuedAt = Date.now().toString();
  const payload = `${nonce}.${issuedAt}`;
  const signature = createHmac("sha256", getOAuthStateSecret())
    .update(payload)
    .digest("hex");
  return `${payload}.${signature}`;
}

export function verifyOAuthState(state: string | null): boolean {
  if (!state) return false;
  const parts = state.split(".");
  if (parts.length !== 3) return false;

  const [nonce, issuedAt, signature] = parts;
  const payload = `${nonce}.${issuedAt}`;
  const expected = createHmac("sha256", getOAuthStateSecret())
    .update(payload)
    .digest("hex");

  if (signature !== expected) return false;

  const ageMs = Date.now() - Number(issuedAt);
  return ageMs >= 0 && ageMs <= STATE_MAX_AGE_SECONDS * 1000;
}

export function getQuickBooksOAuthStateCookie(state: string): string {
  return `${OAUTH_STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${STATE_MAX_AGE_SECONDS}`;
}

export function clearQuickBooksOAuthStateCookie(): string {
  return `${OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function buildQuickBooksAuthorizeUrl(state: string): string {
  const client = createOAuthClient();
  return client.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state,
  });
}

export async function completeQuickBooksOAuth(callbackUrl: string) {
  const client = createOAuthClient();
  const authResponse = await client.createToken(callbackUrl);
  const token = authResponse.getToken();
  const realmId =
    token.realmId ||
    new URL(callbackUrl).searchParams.get("realmId") ||
    "";

  if (!realmId) {
    throw new Error("QuickBooks did not return a company id (realmId)");
  }

  if (!token.access_token || !token.refresh_token) {
    throw new Error("QuickBooks did not return access and refresh tokens");
  }

  const store: QuickBooksTokenStore = {
    realmId,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    token_type: token.token_type,
    expires_in: token.expires_in,
    x_refresh_token_expires_in: token.x_refresh_token_expires_in,
    createdAt: token.createdAt ?? Date.now(),
  };

  await saveQuickBooksTokens(store);
  return store;
}

export async function getAuthenticatedQuickBooksClient(): Promise<{
  client: OAuthClient;
  tokens: QuickBooksTokenStore;
}> {
  const stored = await getQuickBooksTokens();
  if (!stored) {
    throw new Error("QuickBooks is not connected. Use Connect QuickBooks first.");
  }

  const client = createOAuthClient(stored);

  if (!client.isAccessTokenValid()) {
    const authResponse = await client.refresh();
    const refreshed = authResponse.getToken();
    if (!refreshed.access_token || !refreshed.refresh_token) {
      throw new Error("QuickBooks token refresh failed");
    }

    const updated: QuickBooksTokenStore = {
      ...stored,
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_in: refreshed.expires_in,
      x_refresh_token_expires_in: refreshed.x_refresh_token_expires_in,
      createdAt: refreshed.createdAt ?? Date.now(),
      realmId: refreshed.realmId || stored.realmId,
    };
    await saveQuickBooksTokens(updated);
    client.setToken(updated);
    return { client, tokens: updated };
  }

  return { client, tokens: stored };
}
