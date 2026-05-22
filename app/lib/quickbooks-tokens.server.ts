import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

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

const TOKEN_PATH = path.join(process.cwd(), ".data", "quickbooks-tokens.json");

export async function getQuickBooksTokens(): Promise<QuickBooksTokenStore | null> {
  try {
    const raw = await readFile(TOKEN_PATH, "utf8");
    const parsed = JSON.parse(raw) as QuickBooksTokenStore;
    if (!parsed.realmId || !parsed.access_token || !parsed.refresh_token) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveQuickBooksTokens(
  tokens: QuickBooksTokenStore,
): Promise<void> {
  await mkdir(path.dirname(TOKEN_PATH), { recursive: true });
  await writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2), "utf8");
}

export async function clearQuickBooksTokens(): Promise<void> {
  try {
    await writeFile(TOKEN_PATH, "", "utf8");
  } catch {
    // ignore if missing
  }
}

export function isQuickBooksConnected(): Promise<boolean> {
  return getQuickBooksTokens().then((t) => t !== null);
}
