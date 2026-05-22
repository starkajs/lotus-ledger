import { Form, Link } from "react-router";
import type { Route } from "./+types/products";
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
    return { scope: "update" as const, success: true as const };
  }

  return { scope: "unknown" as const, error: "Unknown action" };
}

export default function ProductsPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { products } = loaderData;

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
        {actionData?.scope === "create" && actionData.success && (
          <p className="mt-2 text-sm text-jade">Product added.</p>
        )}
      </section>

      <div className="mt-6 overflow-x-auto rounded-jamyang border border-sand-dark/50">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead className="bg-surface text-dark">
            <tr>
              <th className="px-3 py-2 font-medium">Code</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">QuickBooks item</th>
              <th className="px-3 py-2 font-medium">Active</th>
              <th className="px-3 py-2 font-medium">Save</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-dark/30 bg-surface-overlay">
            {products.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2 font-mono text-xs">{p.code}</td>
                <td className="px-3 py-2" colSpan={3}>
                  <Form method="post" className="flex flex-wrap items-center gap-3">
                    <input type="hidden" name="intent" value="update" />
                    <input type="hidden" name="id" value={p.id} />
                    <input
                      name="name"
                      defaultValue={p.name}
                      className="min-w-[10rem] flex-1 rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1 text-sm"
                    />
                    <input
                      name="quickbooksItemId"
                      defaultValue={p.quickbooksItemId ?? ""}
                      placeholder="QBO item id"
                      className="min-w-[8rem] rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1 text-sm font-mono"
                    />
                    <label className="flex items-center gap-1.5 text-xs text-ink-muted">
                      <input
                        type="checkbox"
                        name="isActive"
                        defaultChecked={p.isActive}
                      />
                      Active
                    </label>
                    <SubmitButton
                      intent={`save-${p.id}`}
                      variant="pill"
                      className="!px-3 !py-1 text-xs"
                      loadingLabel="Saving…"
                    >
                      Save
                    </SubmitButton>
                  </Form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppPage>
  );
}
