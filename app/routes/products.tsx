import { useEffect, useState } from "react";
import { Form, Link } from "react-router";
import type { Route } from "./+types/products";
import { ActionToast } from "~/components/action-toast";
import { AppPage } from "~/components/app-page";
import { SubmitButton } from "~/components/submit-button";
import { listQuickBooksTaxCodes } from "~/lib/quickbooks-master-data.server";
import {
  countStripeTransactionsPerProduct,
  createProduct,
  deleteProduct,
  listProducts,
  parseQuickbooksTaxCodeId,
  parseVatRatePercent,
  updateProduct,
} from "~/lib/products.server";
import { requireUser } from "~/lib/session.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Products — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const [products, stripeTransactionCountByProductId, qbTaxCodes] =
    await Promise.all([
      listProducts(),
      countStripeTransactionsPerProduct(),
      listQuickBooksTaxCodes(),
    ]);
  const activeTaxCodes = qbTaxCodes.taxCodes.filter((t) => t.active);
  return {
    products,
    stripeTransactionCountByProductId,
    qbConnected: qbTaxCodes.connected,
    taxCodes: activeTaxCodes,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "create") {
    const code = String(form.get("code") ?? "").trim();
    const name = String(form.get("name") ?? "").trim();
    const quickbooksItemId = String(form.get("quickbooksItemId") ?? "").trim();
    if (!code || !name) {
      return { scope: "create" as const, error: "Code and name are required" };
    }
    const vatParsed = parseVatRatePercent(String(form.get("vatRatePercent") ?? ""));
    if (!vatParsed.ok) {
      return { scope: "create" as const, error: vatParsed.error };
    }
    const quickbooksTaxCodeId = parseQuickbooksTaxCodeId(
      String(form.get("quickbooksTaxCodeId") ?? ""),
    );
    try {
      await createProduct({
        code,
        name,
        quickbooksItemId: quickbooksItemId || null,
        quickbooksTaxCodeId,
        vatRatePercent: vatParsed.value,
      });
      return { scope: "create" as const, success: true as const };
    } catch (err) {
      return {
        scope: "create" as const,
        error: err instanceof Error ? err.message : "Failed to create product",
      };
    }
  }

  if (intent === "update") {
    const id = String(form.get("id") ?? "");
    const name = String(form.get("name") ?? "").trim();
    const quickbooksItemId = String(form.get("quickbooksItemId") ?? "").trim();
    const isActive = form.get("isActive") === "on";
    if (!id || !name) {
      return { scope: "update" as const, error: "Product id and name are required" };
    }
    const vatParsed = parseVatRatePercent(String(form.get("vatRatePercent") ?? ""));
    if (!vatParsed.ok) {
      return { scope: "update" as const, error: vatParsed.error };
    }
    const quickbooksTaxCodeId = parseQuickbooksTaxCodeId(
      String(form.get("quickbooksTaxCodeId") ?? ""),
    );
    await updateProduct(id, {
      name,
      quickbooksItemId: quickbooksItemId || null,
      quickbooksTaxCodeId,
      vatRatePercent: vatParsed.value,
      isActive,
    });
    return {
      scope: "update" as const,
      success: true as const,
      code: String(form.get("code") ?? ""),
    };
  }

  if (intent === "delete") {
    const id = String(form.get("id") ?? "").trim();
    if (!id) {
      return { scope: "delete" as const, error: "Product id is required" };
    }
    const result = await deleteProduct(id);
    if (!result.ok) {
      return { scope: "delete" as const, error: result.reason };
    }
    return {
      scope: "delete" as const,
      success: true as const,
      code: String(form.get("code") ?? ""),
    };
  }

  return { scope: "unknown" as const, error: "Unknown action" };
}

export default function ProductsPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { products, stripeTransactionCountByProductId, qbConnected, taxCodes } =
    loaderData;
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!actionData) return;
    if (actionData.scope === "create" && actionData.success) {
      setToast("Product added.");
      return;
    }
    if (actionData.scope === "update" && actionData.success) {
      const label = actionData.code?.trim();
      setToast(label ? `${label} saved.` : "Product saved.");
      return;
    }
    if (actionData.scope === "delete" && actionData.success) {
      const label = actionData.code?.trim();
      setToast(label ? `${label} deleted.` : "Product deleted.");
    }
  }, [actionData]);

  return (
    <AppPage
      title="Products"
      description="Lotus product catalog. Map each product to a QuickBooks item, VAT %, and QuickBooks VAT code for Sales Receipt push."
      actions={
        <Link
          to="/products/rules"
          className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 text-sm hover:bg-surface"
        >
          Match rules
        </Link>
      }
    >
      <ActionToast message={toast} onDismiss={() => setToast(null)} />

      <section className="rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay p-4 sm:p-6">
        <h2 className="text-sm font-medium text-dark">Add product</h2>
        {!qbConnected && (
          <p className="mt-2 text-xs text-maroon">
            Connect QuickBooks to pick VAT codes.{" "}
            <Link to="/integrations/quickbooks" className="text-teal underline">
              QuickBooks settings
            </Link>
          </p>
        )}
        {qbConnected && taxCodes.length === 0 && (
          <p className="mt-2 text-xs text-maroon">
            No VAT codes synced yet.{" "}
            <Link
              to="/integrations/quickbooks/tax-codes"
              className="text-teal underline"
            >
              Sync VAT codes
            </Link>{" "}
            under QuickBooks.
          </p>
        )}
        <Form method="post" className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="intent" value="create" />
          <label className="flex flex-col gap-0.5 text-xs">
            <span className="text-ink-muted">Code</span>
            <input
              name="code"
              required
              placeholder="BP"
              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm font-mono uppercase"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-xs min-w-[12rem]">
            <span className="text-ink-muted">Name</span>
            <input
              name="name"
              required
              placeholder="Basic Programme"
              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-xs min-w-[10rem]">
            <span className="text-ink-muted">QuickBooks item ID</span>
            <input
              name="quickbooksItemId"
              placeholder="Optional"
              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm font-mono"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-xs w-[5.5rem]">
            <span className="text-ink-muted">VAT %</span>
            <input
              name="vatRatePercent"
              type="number"
              min={0}
              max={100}
              step={0.01}
              defaultValue={0}
              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm font-mono"
            />
          </label>
          <SubmitButton intent="create" variant="pill" loadingLabel="Adding…">
            Add
          </SubmitButton>
        </Form>
        {actionData?.scope === "create" && actionData.error && (
          <p className="mt-2 text-sm text-maroon">{actionData.error}</p>
        )}
        {(actionData?.scope === "update" || actionData?.scope === "delete") &&
          actionData.error && (
          <p className="mt-2 text-sm text-maroon">{actionData.error}</p>
        )}
      </section>

      <div className="mt-6 overflow-x-auto rounded-jamyang border border-sand-dark/50">
        {products.map((p) => (
          <Form
            key={`form-${p.id}`}
            id={`product-update-${p.id}`}
            method="post"
            className="hidden"
            aria-hidden
          >
            <input type="hidden" name="intent" value="update" />
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="code" value={p.code} />
          </Form>
        ))}
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="bg-surface text-dark">
            <tr>
              <th className="px-3 py-2 font-medium w-[5rem]">Code</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium w-[10rem]">QuickBooks item</th>
              <th className="px-3 py-2 font-medium w-[5rem]">VAT %</th>
              <th className="px-3 py-2 font-medium min-w-[10rem]">QB VAT code</th>
              <th className="px-3 py-2 font-medium w-[5rem]">Active</th>
              <th className="px-3 py-2 font-medium w-[5rem] text-right">Save</th>
              <th className="px-3 py-2 font-medium w-[5rem] text-right">Delete</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-dark/30 bg-surface-overlay">
            {products.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-6 text-center text-sm text-ink-muted"
                >
                  No products yet. Add one above.
                </td>
              </tr>
            ) : (
              products.map((p) => {
                const formId = `product-update-${p.id}`;
                const stripeTxnCount =
                  stripeTransactionCountByProductId[p.id] ?? 0;
                const canDelete = stripeTxnCount === 0;
                return (
                  <tr key={`${p.id}-${p.updatedAt}`} className="align-middle">
                    <td className="px-3 py-2 font-mono text-xs text-dark">
                      {p.code}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        form={formId}
                        name="name"
                        defaultValue={p.name}
                        aria-label={`Name for ${p.code}`}
                        className="w-full min-w-[10rem] rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        form={formId}
                        name="quickbooksItemId"
                        defaultValue={p.quickbooksItemId ?? ""}
                        placeholder="QBO item id"
                        aria-label={`QuickBooks item for ${p.code}`}
                        className="w-full min-w-[8rem] rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1 text-sm font-mono"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        form={formId}
                        name="vatRatePercent"
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        defaultValue={p.vatRatePercent}
                        aria-label={`VAT rate for ${p.code}`}
                        className="w-full max-w-[5rem] rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1 text-sm font-mono text-right"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        form={formId}
                        name="quickbooksTaxCodeId"
                        defaultValue={p.quickbooksTaxCodeId ?? ""}
                        aria-label={`QuickBooks VAT code for ${p.code}`}
                        className="w-full min-w-[10rem] rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1 text-sm"
                      >
                        <option value="">Select…</option>
                        {taxCodes.map((t) => (
                          <option key={t.quickbooksId} value={t.quickbooksId}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <label className="flex items-center gap-1.5 text-xs text-ink-muted">
                        <input
                          form={formId}
                          type="checkbox"
                          name="isActive"
                          defaultChecked={p.isActive}
                          aria-label={`Active for ${p.code}`}
                        />
                        <span className="sr-only sm:not-sr-only">Active</span>
                      </label>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <SubmitButton
                        form={formId}
                        intent={`save-${p.id}`}
                        variant="pill"
                        className="!px-3 !py-1 text-xs"
                        loadingLabel="Saving…"
                      >
                        Save
                      </SubmitButton>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Form
                        method="post"
                        className="inline"
                        onSubmit={(e) => {
                          if (
                            !confirm(
                              `Delete product ${p.code} (${p.name})? Match rules for this product will also be removed.`,
                            )
                          ) {
                            e.preventDefault();
                          }
                        }}
                      >
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="code" value={p.code} />
                        <button
                          type="submit"
                          disabled={!canDelete}
                          title={
                            canDelete
                              ? "Delete product"
                              : `Cannot delete: ${stripeTxnCount} Stripe transaction${stripeTxnCount === 1 ? "" : "s"} use this product`
                          }
                          className="text-sm text-maroon hover:underline disabled:cursor-not-allowed disabled:text-ink-faint disabled:no-underline"
                        >
                          Delete
                        </button>
                      </Form>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </AppPage>
  );
}
