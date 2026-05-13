import { config } from "./config.js";
import { createOrderSyncService } from "./syncOrders.js";
import { createProductSyncService } from "./syncProducts.js";

const runOnce = process.argv.includes("--once");
const mode = process.argv.includes("--orders")
  ? "orders"
  : process.argv.includes("--products")
    ? "products"
    : config.sync.mode;
const syncService = mode === "orders" ? createOrderSyncService() : createProductSyncService();

async function run() {
  console.log(`Starting ${mode} sync`);
  await syncService.syncOnce();

  if (runOnce) {
    return;
  }

  setInterval(async () => {
    try {
      await syncService.syncOnce();
    } catch (error) {
      console.error(error);
    }
  }, config.sync.intervalSeconds * 1000);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
