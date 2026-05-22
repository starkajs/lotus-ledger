/**
 * Import WooCommerce products into woocommerce_products.
 *
 * Usage:
 *   npm run sync:woocommerce-products
 */
import "dotenv/config";
import { closeDb } from "../app/db/index";
import { syncWooCommerceProductsFromApi } from "../app/lib/woocommerce-products.server";

try {
  console.log("Syncing WooCommerce products…");
  const result = await syncWooCommerceProductsFromApi();
  console.log("\nDone.");
  console.log(`  Created: ${result.created}`);
  console.log(`  Updated: ${result.updated}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await closeDb();
}
