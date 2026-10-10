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
          `Assign ${countLabel} to ${productLabel}?\n\nThis sets a manual Lotus product on each order.`,
        );
        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      <p className="w-full text-xs text-ink-muted">
        {someSelected
          ? `${selectedCount} unmapped order${selectedCount === 1 ? "" : "s"} selected on this page`
          : "Select unmapped orders below to assign a Lotus product"}
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
        loadingLabel="Assigning…"
      >
        Assign to selected
      </SubmitButton>
    </Form>
  );
}
