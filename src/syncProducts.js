import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config } from "./config.js";
import { ShopExpressClient } from "./clients/shopExpressClient.js";
import { SkynumClient } from "./clients/skynumClient.js";
import {
  buildContentTask,
  normalizeSkynumProduct,
  toShopExpressProductPayload
} from "./mappers/productMapper.js";

export class ProductSyncService {
  constructor(skynum, shopExpress) {
    this.skynum = skynum;
    this.shopExpress = shopExpress;
  }

  async syncOnce() {
    const updatedFrom = new Date(Date.now() - config.sync.lookbackDays * 24 * 60 * 60 * 1000);
    const [products, remains] = await Promise.all([
      this.skynum.listProducts(updatedFrom),
      this.skynum.listRemains(new Date())
    ]);
    const remainsByProductId = this.groupRemainsByProductId(remains);
    const contentTasks = [];

    console.log(
      `Found ${products.length} Skynum product(s) updated from ${updatedFrom.toISOString()} and ${remains.length} remain row(s)`
    );

    for (const sourceProduct of products) {
      const productWithRemains = {
        ...sourceProduct,
        remains_quantity: remainsByProductId.get(sourceProduct.id) ?? sourceProduct.remains
      };
      const normalized = normalizeSkynumProduct(productWithRemains, {
        autoFillSeo: config.sync.autoFillSeo
      });
      const payload = toShopExpressProductPayload(normalized, config.sync.productMatchKey);
      const contentTask = buildContentTask(normalized);

      if (contentTask) {
        contentTasks.push(contentTask);
      }

      if (config.sync.dryRun) {
        console.log(JSON.stringify({ dryRun: true, shopExpressPayload: payload }, null, 2));
        continue;
      }

      const savedProduct = await this.shopExpress.upsertProduct(payload);
      const shopExpressId = savedProduct?.id ?? savedProduct?.data?.id ?? payload.matchValue;

      await this.shopExpress.updateProductStock(String(shopExpressId), normalized.stock);

      if (normalized.images.length) {
        await this.shopExpress.setProductImages(String(shopExpressId), normalized.images);
      }

      console.log(`Synced Skynum product ${payload.externalId} to Shop-Express`);
    }

    this.writeContentTaskReport(contentTasks);
  }

  writeContentTaskReport(contentTasks) {
    const reportPath = resolve(process.cwd(), config.sync.contentTaskReportPath);
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(
      reportPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          total: contentTasks.length,
          tasks: contentTasks
        },
        null,
        2
      )
    );

    console.log(`Wrote product content task report: ${reportPath}`);
  }

  groupRemainsByProductId(remains) {
    const totals = new Map();

    for (const row of remains) {
      if (!row.product_id) {
        continue;
      }

      const current = totals.get(row.product_id) ?? 0;
      totals.set(row.product_id, current + Number(row.quantity ?? 0));
    }

    return totals;
  }
}

export function createProductSyncService() {
  return new ProductSyncService(
    new SkynumClient(config.skynum),
    new ShopExpressClient(config.shopExpress)
  );
}
