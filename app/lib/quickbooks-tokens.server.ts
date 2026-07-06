import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { desc } from "drizzle-orm";
import { getDb } from "~/db";
import { quickbooksConnections } from "~/db/schema";
import { decryptSecret, encryptSecret } from "./encryption.server";
import { getQuickBooksEnvironment } from "./env.server";

export type QuickBooksTokenStore = {
  realmId: string;
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_in?: number;
  x_refresh_token_expires_in?: number;
  createdAt?: number;
  companyName?: string;
};

const LEGACY_TOKEN_PATH = path.join(
  process.cwd(),
  ".data",
  "quickbooks-tokens.json",
);

async function loadTokensFromLegacyFile(): Promise<QuickBooksTokenStore | null> {
  try {
    const raw = await readFile(LEGACY_TOKEN_PATH, "utf8");
    const parsed = JSON.parse(raw) as QuickBooksTokenStore;
    if (!parsed.realmId || !parsed.access_token || !parsed.refresh_token) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function removeLegacyTokenFile(): Promise<void> {
  try {
    await unlink(LEGACY_TOKEN_PATH);
  } catch {
    // ignore if missing
  }
}

function tokenCreatedAtToStore(
  createdAt: number | undefined,
  fallback: Date,
): number {
  const ms = createdAt ?? fallback.getTime();
  return Math.floor(ms / 1000);
}

function tokenCreatedAtFromStore(
  stored: number | null,
  fallback: Date,
): number {
  if (stored == null) return fallback.getTime();
  // Values saved before the seconds fix may be ms and overflow int32 on write.
  return stored > 2_147_483_647 ? stored : stored * 1000;
}

function rowToTokenStore(
  row: typeof quickbooksConnections.$inferSelect,
): QuickBooksTokenStore {
  return {
    realmId: row.realmId,
    access_token: decryptSecret(row.accessToken),
    refresh_token: decryptSecret(row.refreshToken),
    token_type: row.tokenType ?? undefined,
    expires_in: row.expiresIn ?? undefined,
    x_refresh_token_expires_in: row.refreshTokenExpiresIn ?? undefined,
    createdAt: tokenCreatedAtFromStore(row.tokenCreatedAt, row.updatedAt),
    companyName: row.companyName ?? undefined,
  };
}

async function loadTokensFromDatabase(): Promise<QuickBooksTokenStore | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(quickbooksConnections)
    .orderBy(desc(quickbooksConnections.updatedAt))
    .limit(1);

  if (!row) return null;

  try {
    return rowToTokenStore(row);
  } catch {
    return null;
  }
}

async function saveTokensToDatabase(tokens: QuickBooksTokenStore): Promise<void> {
  const db = getDb();
  const now = new Date();
  const values = {
    realmId: tokens.realmId,
    accessToken: encryptSecret(tokens.access_token),
    refreshToken: encryptSecret(tokens.refresh_token),
    tokenType: tokens.token_type ?? null,
    expiresIn: tokens.expires_in ?? null,
    refreshTokenExpiresIn: tokens.x_refresh_token_expires_in ?? null,
    tokenCreatedAt: tokenCreatedAtToStore(tokens.createdAt, now),
    livemode: getQuickBooksEnvironment() === "production",
    companyName: tokens.companyName ?? null,
    updatedAt: now,
  };

  await db
    .insert(quickbooksConnections)
    .values({
      ...values,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: quickbooksConnections.realmId,
      set: values,
    });
}

export async function getQuickBooksTokens(): Promise<QuickBooksTokenStore | null> {
  const fromDatabase = await loadTokensFromDatabase();
  if (fromDatabase) return fromDatabase;

  const fromFile = await loadTokensFromLegacyFile();
  if (!fromFile) return null;

  await saveTokensToDatabase(fromFile);
  await removeLegacyTokenFile();
  return fromFile;
}

export async function saveQuickBooksTokens(
  tokens: QuickBooksTokenStore,
): Promise<void> {
  await saveTokensToDatabase(tokens);
  await removeLegacyTokenFile();
}

export async function clearQuickBooksTokens(): Promise<void> {
  const db = getDb();
  await db.delete(quickbooksConnections);
  try {
    await writeFile(LEGACY_TOKEN_PATH, "", "utf8");
  } catch {
    // ignore if missing
  }
}

export function isQuickBooksConnected(): Promise<boolean> {
  return getQuickBooksTokens().then((t) => t !== null);
}
