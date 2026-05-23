import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { stripeConnections } from "~/db/schema";

export const DEFAULT_STRIPE_QB_PAYMENT_REF_TEMPLATE = "{{payment_intent_id}}";

export type StripeConnectionQuickBooksMapping = {
  id: string;
  label: string;
  quickbooksCustomerId: string | null;
  quickbooksDepositAccountId: string | null;
  quickbooksPaymentMethodId: string | null;
  quickbooksPaymentRefTemplate: string | null;
  quickbooksCustomerMemoTemplate: string | null;
};

export async function getStripeConnectionQuickBooksMapping(
  connectionId: string,
): Promise<StripeConnectionQuickBooksMapping | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: stripeConnections.id,
      label: stripeConnections.label,
      quickbooksCustomerId: stripeConnections.quickbooksCustomerId,
      quickbooksDepositAccountId: stripeConnections.quickbooksDepositAccountId,
      quickbooksPaymentMethodId: stripeConnections.quickbooksPaymentMethodId,
      quickbooksPaymentRefTemplate: stripeConnections.quickbooksPaymentRefTemplate,
      quickbooksCustomerMemoTemplate:
        stripeConnections.quickbooksCustomerMemoTemplate,
    })
    .from(stripeConnections)
    .where(eq(stripeConnections.id, connectionId))
    .limit(1);
  return row ?? null;
}

export async function updateStripeConnectionQuickBooksMapping(
  connectionId: string,
  input: {
    quickbooksCustomerId?: string | null;
    quickbooksDepositAccountId?: string | null;
    quickbooksPaymentMethodId?: string | null;
    quickbooksPaymentRefTemplate?: string | null;
    quickbooksCustomerMemoTemplate?: string | null;
  },
): Promise<void> {
  const db = getDb();
  await db
    .update(stripeConnections)
    .set({
      ...(input.quickbooksCustomerId !== undefined
        ? {
            quickbooksCustomerId:
              input.quickbooksCustomerId?.trim() || null,
          }
        : {}),
      ...(input.quickbooksDepositAccountId !== undefined
        ? {
            quickbooksDepositAccountId:
              input.quickbooksDepositAccountId?.trim() || null,
          }
        : {}),
      ...(input.quickbooksPaymentMethodId !== undefined
        ? {
            quickbooksPaymentMethodId:
              input.quickbooksPaymentMethodId?.trim() || null,
          }
        : {}),
      ...(input.quickbooksPaymentRefTemplate !== undefined
        ? {
            quickbooksPaymentRefTemplate:
              input.quickbooksPaymentRefTemplate?.trim() || null,
          }
        : {}),
      ...(input.quickbooksCustomerMemoTemplate !== undefined
        ? {
            quickbooksCustomerMemoTemplate:
              input.quickbooksCustomerMemoTemplate?.trim() || null,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(stripeConnections.id, connectionId));
}
