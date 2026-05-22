import { asc, eq } from "drizzle-orm";
import Stripe from "stripe";
import { getDb } from "~/db";
import { stripeConnections } from "~/db/schema";
import {
  decryptSecret,
  encryptSecret,
  secretKeyLast4,
} from "./encryption.server";
import {
  assertValidStripeSecretKey,
  normalizeStripeSecretKey,
} from "./stripe-keys.server";

export type StripeConnectionPublic = {
  id: string;
  label: string;
  stripeAccountId: string | null;
  keyLast4: string;
  livemode: boolean;
  defaultCurrency: string | null;
  createdAt: string;
};

function mapPublic(row: typeof stripeConnections.$inferSelect): StripeConnectionPublic {
  return {
    id: row.id,
    label: row.label,
    stripeAccountId: row.stripeAccountId,
    keyLast4: row.keyLast4,
    livemode: row.livemode,
    defaultCurrency: row.defaultCurrency,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listStripeConnections(): Promise<StripeConnectionPublic[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(stripeConnections)
    .orderBy(asc(stripeConnections.createdAt));
  return rows.map(mapPublic);
}

export async function getStripeConnectionById(id: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(stripeConnections)
    .where(eq(stripeConnections.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getStripeClientForConnection(
  connectionId: string,
): Promise<Stripe> {
  const row = await getStripeConnectionById(connectionId);
  if (!row) {
    throw new Error("Stripe connection not found");
  }
  const secretKey = decryptSecret(row.secretKeyEncrypted);
  return new Stripe(secretKey);
}

export async function createStripeConnection(input: {
  label: string;
  secretKey: string;
  addedByUserId: string;
}): Promise<{ connection: StripeConnectionPublic; verify: StripeVerifyResult }> {
  const secretKey = normalizeStripeSecretKey(input.secretKey);
  assertValidStripeSecretKey(secretKey);

  const stripe = new Stripe(secretKey);
  const verify = await verifyStripeAccount(stripe);

  const db = getDb();
  const rows = await db
    .insert(stripeConnections)
    .values({
      label: input.label.trim(),
      stripeAccountId: verify.stripeAccountId,
      secretKeyEncrypted: encryptSecret(secretKey),
      keyLast4: secretKeyLast4(secretKey),
      livemode: verify.livemode,
      defaultCurrency: verify.currency ?? null,
      addedByUserId: input.addedByUserId,
    })
    .returning();

  return { connection: mapPublic(rows[0]), verify };
}

export async function deleteStripeConnection(id: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .delete(stripeConnections)
    .where(eq(stripeConnections.id, id))
    .returning({ id: stripeConnections.id });
  return rows.length > 0;
}

export type StripeVerifyResult = {
  ok: boolean;
  stripeAccountId: string | null;
  currency?: string;
  availableBalance?: number;
  livemode: boolean;
  error?: string;
};

async function verifyStripeAccount(stripe: Stripe): Promise<StripeVerifyResult> {
  try {
    const balance = await stripe.balance.retrieve();
    const account = (await stripe.rawRequest("GET", "/v1/account", undefined, {
      apiVersion: stripe.getApiField("version"),
    })) as Stripe.Account;
    const primary = balance.available[0];
    return {
      ok: true,
      stripeAccountId: account.id,
      currency: primary?.currency,
      availableBalance: primary
        ? formatAmount(primary.amount, primary.currency)
        : undefined,
      livemode: balance.livemode,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe verification failed";
    return { ok: false, stripeAccountId: null, livemode: false, error: message };
  }
}

const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf",
  "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

function formatAmount(cents: number, currency: string): number {
  if (ZERO_DECIMAL.has(currency.toLowerCase())) return cents;
  return cents / 100;
}

export async function verifyStoredStripeConnection(
  connectionId: string,
): Promise<StripeVerifyResult> {
  try {
    const stripe = await getStripeClientForConnection(connectionId);
    return verifyStripeAccount(stripe);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe verification failed";
    return { ok: false, stripeAccountId: null, livemode: false, error: message };
  }
}
