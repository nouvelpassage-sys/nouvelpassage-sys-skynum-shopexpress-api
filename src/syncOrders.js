import { config } from "./config.js";
import { ShopExpressClient } from "./clients/shopExpressClient.js";
import { SkynumClient } from "./clients/skynumClient.js";
import { normalizeShopExpressOrder, toSkynumOrderPayload } from "./mappers/orderMapper.js";

export class OrderSyncService {
  constructor(shopExpress, skynum) {
    this.shopExpress = shopExpress;
    this.skynum = skynum;
  }

  async syncOnce() {
    const updatedFrom = new Date(Date.now() - config.sync.lookbackDays * 24 * 60 * 60 * 1000);
    const orders = await this.shopExpress.listOrders(updatedFrom);

    console.log(`Found ${orders.length} Shop-Express order(s) updated from ${updatedFrom.toISOString()}`);

    for (const order of orders) {
      const normalized = normalizeShopExpressOrder(order, config.sync.statusMapping);
      const payload = toSkynumOrderPayload(normalized);

      if (config.sync.dryRun) {
        console.log(JSON.stringify({ dryRun: true, skynumPayload: payload }, null, 2));
        continue;
      }

      await this.skynum.upsertOrder(payload);
      console.log(`Synced Shop-Express order ${payload.externalId} to Skynum`);
    }
  }
}

export function createOrderSyncService() {
  return new OrderSyncService(
    new ShopExpressClient(config.shopExpress),
    new SkynumClient(config.skynum)
  );
}
