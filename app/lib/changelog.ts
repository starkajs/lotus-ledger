/**
 * User-facing release notes. Add a new entry at the top for each deployment.
 *
 * `commit` is the full SHA of the release commit on GitHub. `parent` is the
 * previous release, used for the compare link. Record `commit` once that
 * commit exists, then deploy the update that contains the SHA.
 */
export const GITHUB_REPOSITORY = "https://github.com/starkajs/lotus-ledger";

export type ChangelogEntry = {
  id: string;
  /** Calendar date the deployment shipped, YYYY-MM-DD. */
  shipped: string;
  title: string;
  changes: string[];
  /** Full GitHub SHA. Empty until the release commit exists. */
  commit: string;
  /** Full SHA of the previous release. */
  parent: string;
};

export const changelog: ChangelogEntry[] = [
  {
    id: "2026-10-11-nightly-sync",
    shipped: "2026-10-11",
    title: "Nightly sync runs again",
    changes: [
      "The scheduled WooCommerce, Stripe, and QuickBooks sync starts on its own each night.",
    ],
    commit: "d7f705336f60f07876a332657c4d8b7e1a43a88c",
    parent: "6001215034a37fc7dd836396dfd2494ffa8839bb",
  },
  {
    id: "2026-10-10-stripe-product-rules",
    shipped: "2026-10-10",
    title: "Stripe products from orders and rules",
    changes: [
      "A Stripe charge linked to a WooCommerce order takes that order's Lotus product, and therefore its QuickBooks item.",
      "Saving a match rule from a Stripe transaction maps other unmatched charges with the same text. Future syncs use the rule.",
      "A Stripe charge already pushed to QuickBooks keeps its Lotus product.",
    ],
    commit: "6001215034a37fc7dd836396dfd2494ffa8839bb",
    parent: "abf5e92f222d4646315956763d4f244235da0434",
  },
  {
    id: "2026-10-10-wc-stripe-other-period",
    shipped: "2026-10-10",
    title: "Stripe and WooCommerce in another period",
    changes: [
      "The WooCommerce to Stripe reconciliation separates orders whose Stripe charge is in another period, and Stripe charges whose WooCommerce order is in another period.",
    ],
    commit: "abf5e92f222d4646315956763d4f244235da0434",
    parent: "4806828a3aabb0423e1b67e570b1129ca7673d95",
  },
  {
    id: "2026-10-10-reconciliation-accordions",
    shipped: "2026-10-10",
    title: "Reconciliation details collapse",
    changes: [
      "Each group on the WooCommerce to Stripe and Stripe to QuickBooks reconciliations can be opened or closed. The totals stay visible, and the transaction list starts closed.",
    ],
    commit: "f3613611d475ae49219db2af6e21498d1648938d",
    parent: "76b61254037b40c2e9f7d525e868ccacdbd98251",
  },
  {
    id: "2026-10-10-wc-stripe-no-charge",
    shipped: "2026-10-10",
    title: "WooCommerce orders with no Stripe charge",
    changes: [
      "The WooCommerce to Stripe reconciliation lists failed, pending, and cancelled orders separately, because those payments never became a Stripe charge.",
    ],
    commit: "47cba127889301025e72e15b20e8818140d1b8b5",
    parent: "606ba91f447b7c334c2b874b3a92ab2a6438ebfc",
  },
  {
    id: "2026-10-10-wc-order-amount-cast",
    shipped: "2026-10-10",
    title: "WooCommerce amount filter",
    changes: [
      "Filtering WooCommerce orders by amount compares the total as a number, so the page loads.",
    ],
    commit: "b7f3a5a68c62e645c84060b76c197136c33c8777",
    parent: "ee27f317e10ad1be5d3b909dff91fb4b5c57ab91",
  },
  {
    id: "2026-10-10-wc-order-filters",
    shipped: "2026-10-10",
    title: "Filter WooCommerce orders by product and amount",
    changes: [
      "WooCommerce orders can be filtered by a Lotus product, and by an amount from and amount to.",
      "The sales by product page uses the same filters.",
    ],
    commit: "446daf8ee93a7432d944078ba28b8004bc774a31",
    parent: "170b0174ea8fa6cbd9fb9c2847e48c716206f87b",
  },
  {
    id: "2026-10-10-wc-order-product-link",
    shipped: "2026-10-10",
    title: "Assigning an order links the shop product",
    changes: [
      "Assigning a Lotus product from WooCommerce orders links the shop products on the selected orders.",
      "Every other order that uses those shop products is mapped as well. An order with no shop product is still set on that order only.",
    ],
    commit: "e8e51a6f5867f2e61db6fbf88dccf51f883d87b0",
    parent: "ab595c02668213fd65f6c85cdac1adcd732439ab",
  },
  {
    id: "2026-10-10-wc-order-lines",
    shipped: "2026-10-10",
    title: "Richer WooCommerce order lines, and bulk assign",
    changes: [
      "Each order line shows the course or event title, donation tier or frequency when the shop recorded them, and the SKU.",
      "Unmapped orders can be selected and assigned a Lotus product, the same way as Stripe transactions.",
    ],
    commit: "362afbe242a23cde7593e9544aa159fc33235f07",
    parent: "7b729a8f0b9987926375af91c7178d69d3347a2a",
  },
  {
    id: "2026-10-10-wc-ordered-unlinked",
    shipped: "2026-10-10",
    title: "WooCommerce products waiting to be mapped",
    changes: [
      "WooCommerce products can be filtered to those that appear on an order and still have no Lotus product.",
    ],
    commit: "9449fdbd762275ebe777e192a7020a8c298bf350",
    parent: "f827ac8638f780b45b6b33e1bcb56a1fd9b3710e",
  },
  {
    id: "2026-10-10-stripe-page-load",
    shipped: "2026-10-10",
    title: "Stripe page loads from Lotus",
    changes: [
      "The Stripe page shows the saved account and recent stored transactions without waiting for Stripe to answer.",
      "Last sync is the time of the last transaction pull. Refresh all still contacts Stripe.",
    ],
    commit: "4e142a5ee44e143982d23df0b2c5758ad7ca37a5",
    parent: "30cd4200c61f7c4ae492818c322c41085186c147",
  },
  {
    id: "2026-10-10-woocommerce-page-load",
    shipped: "2026-10-10",
    title: "WooCommerce page loads from Lotus",
    changes: [
      "The WooCommerce page shows order and product counts and the last sync times without waiting for the shop to answer.",
      "Order and product lists leave the full shop payload on the detail page.",
    ],
    commit: "fc0be71279d79fea14b63b16c511a321ce37e049",
    parent: "529d63ece836e4157b9dd4d7701c90a2aba70dba",
  },
  {
    id: "2026-10-10-sync-gaps",
    shipped: "2026-10-10",
    title: "Syncs fill days that were missed",
    changes: [
      "Stripe, WooCommerce orders, and QuickBooks receipts start from the first day a previous sync did not cover, back as far as 120 days.",
      "A refresh still uses the last 30 days once that history is continuous.",
    ],
    commit: "7ecaba9605044a1f430b5511f6257bbaa6025b35",
    parent: "ddd604b7aba8a651e925d7c3d6dbfd291bcae0b1",
  },
  {
    id: "2026-10-10-stripe-woo-refresh-all",
    shipped: "2026-10-10",
    title: "Refresh all for Stripe and WooCommerce",
    changes: [
      "Stripe has a Refresh all button. One press pulls balance transactions for every saved account.",
      "WooCommerce has a Refresh all button. One press pulls orders and the product catalog.",
      "Orders and Stripe transactions cover the last 30 days, or from the newest row already stored when that is older, up to 90 days.",
    ],
    commit: "db3790608b7fafe7e6cdc71cb119b5f85d3483c0",
    parent: "87c1c7368c03d7bf961b97cfd487ca5f616c396a",
  },
  {
    id: "2026-10-10-receipt-catchup",
    shipped: "2026-10-10",
    title: "Sales and refund receipt refresh catches up",
    changes: [
      "Refreshing sales receipts or refund receipts now starts from the newest receipt already stored when that is older than 30 days, so a gap is filled.",
      "Last refreshed shows when that refresh finished, including a refresh that finds no new receipts.",
    ],
    commit: "2e52a1e29072c142d2b8c2dae1f0c7e20cebd3fd",
    parent: "469eb0ab84edd134f09d30c31271fe79a44febba",
  },
  {
    id: "2026-10-10-quickbooks-refresh-all",
    shipped: "2026-10-10",
    title: "Refresh all QuickBooks data",
    changes: [
      "QuickBooks has a Refresh all button. One press pulls accounts, classes, VAT codes, products and services, payment methods, and the last 30 days of sales and refund receipts.",
      "A list that fails is reported on the page, and the other lists still refresh. Each list is still recorded in job history.",
    ],
    commit: "8ab67b838676ce632a238bc308d73371cbbff485",
    parent: "cc6edbbeb2f8889c866d32fbaa79c5debe47f168",
  },
  {
    id: "2026-10-10-home-syncs",
    shipped: "2026-10-10",
    title: "Last syncs on Home",
    changes: [
      "Home shows when the nightly sync, WooCommerce, Stripe, and QuickBooks pulls last ran, with the status and result.",
      "A sync that has never run is marked Never. Job history still has the full log.",
    ],
    commit: "e77bcfbe326702042c7cf3b789c77b422e322a6f",
    parent: "1e082e37d38e86f49023a2378e6d0a258eaff61f",
  },
  {
    id: "2026-10-10-quickbooks-description",
    shipped: "2026-10-10",
    title: "QuickBooks descriptions, and a safer clear",
    changes: [
      "The description sent to QuickBooks starts with the Lotus product, then the Stripe detail, line item, SKU, and WooCommerce order when those differ.",
      "Administrators can update that description on a receipt that was already pushed. The update rewrites the existing receipt.",
      "Clearing the pushed flag now waits until QuickBooks reports that receipt is deleted. If the receipt is still there, Lotus keeps the link.",
    ],
    commit: "825960c406f8a4f20e8439ff781ef2ce98127991",
    parent: "59c6eb9c26114094287e087206c33b0f7b990a38",
  },
  {
    id: "2026-10-10-sessions",
    shipped: "2026-10-10",
    title: "Shorter sessions and a sign-in record",
    changes: [
      "A sign-in ends after 12 hours without use. It still ends after 30 days even if it is used.",
      "Account can sign out every other session and leave this browser signed in.",
      "Administrators can read recent sign-ins, failed attempts, and sign-outs.",
      "The app process runs as the node user. The QuickBooks client uses patched axios and form-data.",
    ],
    commit: "8e2a34e45855210823daddef75e673c2bfb33049",
    parent: "06f55612ee768b7ce486c18e5e1e4af8f2c4a829",
  },
  {
    id: "2026-10-10-confirm",
    shipped: "2026-10-10",
    title: "Email confirmation and safer product rules",
    changes: [
      "Changing an email address now needs a Confirm button on the page. Opening the link, including from an email scanner, no longer applies the change.",
      "Product match patterns that are too long, invalid, or too expensive to run are refused. Existing patterns of that kind are skipped.",
      "The QuickBooks connection cookie is only sent over HTTPS.",
      "The app image now runs on Node 22.",
    ],
    commit: "65613375054a13c8dc3fab1fb9d463ef92c658ae",
    parent: "e3c2bf224c4605668afccfe337a99d0fe4132e58",
  },
  {
    id: "2026-10-10",
    shipped: "2026-10-10",
    title: "Access control and sign-in lockout",
    changes: [
      "Administrators invite people, reset passwords, and manage Stripe and QuickBooks. Members can read data and reconcile.",
      "New passwords must be at least 12 characters. Anyone invited, or whose password was reset, chooses a new password before using the app.",
      "Ten failed sign-in attempts for the same email within 15 minutes pause further attempts until that window passes.",
      "Pages send framing, content-type, and referrer protections to the browser.",
      "The health check reports that the database is unavailable without showing the driver error.",
    ],
    commit: "8b2db23c580d93bf15e880660157611881e6927f",
    parent: "d4286cba9b176f1660f5b3f740b531c846fd4fa5",
  },
];

export function githubCommitUrl(sha: string): string {
  return `${GITHUB_REPOSITORY}/commit/${sha}`;
}

export function githubCompareUrl(parent: string, commit: string): string {
  return `${GITHUB_REPOSITORY}/compare/${parent}...${commit}`;
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}
