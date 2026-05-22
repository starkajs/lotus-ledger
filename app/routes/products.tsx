import { useEffect, useState } from "react";
import { Form, Link } from "react-router";
import type { Route } from "./+types/products";
import { ActionToast } from "~/components/action-toast";
import { AppPage } from "~/components/app-page";
import { SubmitButton } from "~/components/submit-button";
import {
  createProduct,
  listProducts,
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
  const products = await listProducts();
  return { products };
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
    try {
      await createProduct({
        code,
        name,
        quickbooksItemId: quickbooksItemId || null,
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
    await updateProduct(id, {
      name,
      quickbooksItemId: quickbooksItemId || null,
      isActive,
    });
    return {
      scope: "update" as const,
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
  const { products } = loaderData;
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
    }
  }, [actionData]);

  return (
    <AppPage
      title="Products"
      description="Lotus product catalog. Each product maps to one QuickBooks item for pushes."
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
          <SubmitButton intent="create" variant="pill" loadingLabel="Adding…">
            Add
          </SubmitButton>
        </Form>
        {actionData?.scope === "create" && actionData.error && (
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
              <th className="px-3 py-2 font-medium w-[5rem]">Active</th>
              <th className="px-3 py-2 font-medium w-[5rem] text-right">Save</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-dark/30 bg-surface-overlay">
            {products.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-sm text-ink-muted"
                >
                  No products yet. Add one above.
                </td>
              </tr>
            ) : (
              products.map((p) => {
                const formId = `product-update-${p.id}`;
                return (
                  <tr key={p.id} className="align-middle">
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
