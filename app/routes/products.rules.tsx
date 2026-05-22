import { Form, Link } from "react-router";
import type { Route } from "./+types/products.rules";
import { AppPage } from "~/components/app-page";
import { SubmitButton } from "~/components/submit-button";
import {
  collectClassificationText,
  evaluateProductMatch,
  listActiveProductMatchRules,
} from "~/lib/product-classification.server";
import {
  createProductMatchRule,
  deleteProductMatchRule,
  listProductMatchRules,
  listProducts,
  updateProductMatchRule,
} from "~/lib/products.server";
import { requireUser } from "~/lib/session.server";

const FIELD_OPTIONS = [
  "any",
  "sku",
  "balance_description",
  "charge_description",
  "line_item_1",
  "line_items_summary",
  "donorbox_metadata",
  "metadata_all",
] as const;

const MATCH_TYPES = ["contains", "regex", "sku"] as const;

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Product match rules — Lotus Ledger" },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const sampleText = url.searchParams.get("sample") ?? "";

  const [rules, products] = await Promise.all([
    listProductMatchRules(),
    listProducts({ activeOnly: true }),
  ]);

  let testResult: ReturnType<typeof evaluateProductMatch> | null = null;
  if (sampleText.trim()) {
    const texts = collectClassificationText({
      description: sampleText,
      stripeRaw: {
        source: {
          object: "charge",
          description: sampleText,
          metadata: {
            "Line Item 1": sampleText,
            line_items_summary: sampleText,
          },
        },
      },
    });
    const activeRules = await listActiveProductMatchRules();
    testResult = evaluateProductMatch(texts, activeRules);
  }

  return { rules, products, sampleText, testResult };
}

export async function action({ request }: Route.ActionArgs) {
  await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "create") {
    const productId = String(form.get("productId") ?? "");
    const priority = Number(form.get("priority") ?? "100");
    const field = String(form.get("field") ?? "any");
    const matchType = String(form.get("matchType") ?? "contains");
    const pattern = String(form.get("pattern") ?? "").trim();
    if (!productId || !pattern) {
      return { scope: "create" as const, error: "Product and pattern are required" };
    }
    await createProductMatchRule({
      productId,
      priority: Number.isFinite(priority) ? priority : 100,
      field,
      matchType,
      pattern,
    });
    return { scope: "create" as const, success: true as const };
  }

  if (intent === "toggle") {
    const id = String(form.get("id") ?? "");
    const isActive = form.get("isActive") === "true";
    if (!id) return { scope: "toggle" as const, error: "Rule id required" };
    await updateProductMatchRule(id, { isActive: !isActive });
    return { scope: "toggle" as const, success: true as const };
  }

  if (intent === "delete") {
    const id = String(form.get("id") ?? "");
    if (!id) return { scope: "delete" as const, error: "Rule id required" };
    await deleteProductMatchRule(id);
    return { scope: "delete" as const, success: true as const };
  }

  return { scope: "unknown" as const, error: "Unknown action" };
}

export default function ProductRulesPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { rules, products, sampleText, testResult } = loaderData;
  const productById = Object.fromEntries(products.map((p) => [p.id, p]));

  return (
    <AppPage
      title="Product match rules"
      description="Lower priority runs first. First matching rule at a priority level wins; two matches at the same priority is ambiguous."
      actions={
        <Link
          to="/products"
          className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 text-sm hover:bg-surface"
        >
          Products
        </Link>
      }
    >
      <section className="rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay p-4 sm:p-6">
        <h2 className="text-sm font-medium text-dark">Test sample text</h2>
        <Form method="get" className="mt-3 flex flex-wrap gap-2">
          <textarea
            name="sample"
            defaultValue={sampleText}
            rows={3}
            placeholder="Paste description or metadata snippet…"
            className="min-w-[16rem] flex-1 rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
          />
          <button
            type="submit"
            className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 text-sm hover:bg-surface self-start"
          >
            Test
          </button>
        </Form>
        {testResult && sampleText.trim() && (
          <p className="mt-2 text-sm text-ink-muted">
            Result:{" "}
            <span className="font-medium text-dark capitalize">{testResult.status}</span>
            {testResult.productId && productById[testResult.productId] && (
              <>
                {" "}
                → {productById[testResult.productId]!.code} (
                {productById[testResult.productId]!.name})
              </>
            )}
          </p>
        )}
      </section>

      <section className="mt-6 rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay p-4 sm:p-6">
        <h2 className="text-sm font-medium text-dark">Add rule</h2>
        <Form method="post" className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="intent" value="create" />
          <label className="flex flex-col gap-0.5 text-xs">
            <span className="text-ink-muted">Product</span>
            <select
              name="productId"
              required
              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-xs">
            <span className="text-ink-muted">Priority</span>
            <input
              name="priority"
              type="number"
              defaultValue={100}
              className="w-20 rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-xs">
            <span className="text-ink-muted">Field</span>
            <select
              name="field"
              defaultValue="any"
              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
            >
              {FIELD_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-xs">
            <span className="text-ink-muted">Match</span>
            <select
              name="matchType"
              defaultValue="contains"
              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
            >
              {MATCH_TYPES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-xs min-w-[12rem] flex-1">
            <span className="text-ink-muted">Pattern</span>
            <input
              name="pattern"
              required
              placeholder="basic programme"
              className="rounded-jamyang border border-sand-dark/60 bg-surface px-2 py-1.5 text-sm"
            />
          </label>
          <SubmitButton intent="create-rule" variant="pill" loadingLabel="Adding…">
            Add rule
          </SubmitButton>
        </Form>
        {actionData?.scope === "create" && actionData.error && (
          <p className="mt-2 text-sm text-maroon">{actionData.error}</p>
        )}
      </section>

      <div className="mt-6 overflow-x-auto rounded-jamyang border border-sand-dark/50">
        <table className="w-full min-w-[40rem] text-left text-xs">
          <thead className="bg-surface text-dark">
            <tr>
              <th className="px-2 py-1.5 font-medium">Pri</th>
              <th className="px-2 py-1.5 font-medium">Product</th>
              <th className="px-2 py-1.5 font-medium">Field</th>
              <th className="px-2 py-1.5 font-medium">Match</th>
              <th className="px-2 py-1.5 font-medium">Pattern</th>
              <th className="px-2 py-1.5 font-medium">Active</th>
              <th className="px-2 py-1.5 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-dark/30 bg-surface-overlay">
            {rules.map((r) => (
              <tr key={r.id} className={!r.isActive ? "opacity-50" : undefined}>
                <td className="px-2 py-1.5 font-mono">{r.priority}</td>
                <td className="px-2 py-1.5">
                  <span className="font-mono">{r.productCode}</span>
                  <span className="text-ink-faint"> {r.productName}</span>
                </td>
                <td className="px-2 py-1.5">{r.field}</td>
                <td className="px-2 py-1.5">{r.matchType}</td>
                <td className="px-2 py-1.5 font-mono max-w-[16rem] truncate" title={r.pattern}>
                  {r.pattern}
                </td>
                <td className="px-2 py-1.5">
                  <Form method="post">
                    <input type="hidden" name="intent" value="toggle" />
                    <input type="hidden" name="id" value={r.id} />
                    <input
                      type="hidden"
                      name="isActive"
                      value={r.isActive ? "true" : "false"}
                    />
                    <button
                      type="submit"
                      className="text-teal hover:underline"
                    >
                      {r.isActive ? "On" : "Off"}
                    </button>
                  </Form>
                </td>
                <td className="px-2 py-1.5 text-right">
                  <Form method="post">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="id" value={r.id} />
                    <button
                      type="submit"
                      className="text-maroon hover:underline"
                    >
                      Delete
                    </button>
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
