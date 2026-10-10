import { Form } from "react-router";
import { SubmitButton } from "~/components/submit-button";
import type { ProductRecord } from "~/lib/products.server";

export function WooCommerceOrdersBulkAssignForm({
  selectedCount,
  selectedOrderIds,
  catalogProducts,
  postAction,
}: {
  selectedCount: number;
  selectedOrderIds: string[];
  catalogProducts: ProductRecord[];
  postAction: string;
}) {
  const someSelected = selectedCount > 0;

  return (
    <Form
      method="post"
      action={postAction}
      className="mt-3 flex flex-wrap items-end gap-3 rounded-jamyang border border-sand-dark/50 bg-surface px-3 py-3"
      onSubmit={(event) => {
        const form = event.currentTarget;
        const productSelect = form.elements.namedItem(
          "productId",
        ) as HTMLSelectElement | null;
        const productId = productSelect?.value.trim() ?? "";
        if (!productId) {
          event.preventDefault();
          window.alert("Choose a Lotus product to assign.");
          return;
        }
        const productLabel =
          productSelect?.options[productSelect.selectedIndex]?.text?.trim() ??
          "the selected product";
        const countLabel = `${selectedCount} order${selectedCount === 1 ? "" : "s"}`;
        const confirmed = window.confirm(
          `Link the shop products on ${countLabel} to ${productLabel}?\n\nEvery other order that uses those shop products is mapped too.`,
        );
        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      <p className="w-full text-xs text-ink-muted">
        {someSelected
          ? `${selectedCount} unmapped order${selectedCount === 1 ? "" : "s"} selected. Linking their shop products maps every order that uses them.`
          : "Select one unmapped order to link its shop product. Every other order with that product is mapped too."}
      </p>
      {selectedOrderIds.map((id) => (
        <input key={id} type="hidden" name="orderIds" value={id} />
      ))}
      <label className="flex flex-col gap-0.5 text-xs">
        <span className="text-ink-muted">Lotus product</span>
        <select
          name="productId"
          required
          className="rounded-jamyang border border-sand-dark/60 bg-surface-overlay px-2 py-1.5 text-sm min-w-[14rem]"
          defaultValue=""
        >
          <option value="">— Select product —</option>
          {catalogProducts.map((product) => (
            <option key={product.id} value={product.id}>
              {product.code} — {product.name}
              {!product.isActive ? " (inactive)" : ""}
            </option>
          ))}
        </select>
      </label>
      <SubmitButton
        intent="bulk-assign-product"
        variant="pill"
        disabled={!someSelected}
        loadingLabel="Linking…"
      >
        Link shop products
      </SubmitButton>
    </Form>
  );
}
