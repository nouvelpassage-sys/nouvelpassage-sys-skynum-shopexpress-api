import { HttpClient } from "../http.js";

export class SkynumClient {
  constructor(config) {
    this.config = config;
    const headers = {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${config.token}`
    };

    if (config.partnerToken) {
      headers["x-partner-token"] = config.partnerToken;
    }

    this.http = new HttpClient(config.baseUrl, {
      ...headers
    });
  }

  async listProducts(updatedFrom) {
    const products = [];
    const limit = 1000;
    let offset = 1;

    while (true) {
      const response = await this.http.request(this.config.productsListPath, {
        query: {
          offset,
          limit,
          updated_from: updatedFrom.toISOString(),
          extended: true,
          with_images: true,
          with_custom_fields: true,
          stock_id: this.config.stockId
        }
      });

      const page = Array.isArray(response)
        ? response
        : response?.products ?? response?.data ?? response?.items ?? [];

      products.push(...page);

      if (page.length < limit) {
        return products;
      }

      offset += 1;
    }
  }

  async listRemains(date = new Date()) {
    const response = await this.http.request(this.config.remainsReportPath, {
      query: {
        date: date.toISOString().slice(0, 10),
        stock_id: this.config.stockId,
        typeprice: "price_retail"
      }
    });

    if (Array.isArray(response)) {
      return response;
    }

    return response?.report ?? response?.data ?? response?.items ?? [];
  }

  async upsertOrder(order) {
    await this.http.request(this.config.ordersUpsertPath, {
      method: "POST",
      body: order
    });
  }

  async updateOrderStatus(orderId, status) {
    const path = this.config.orderStatusPathTemplate.replace("{id}", encodeURIComponent(orderId));
    await this.http.request(path, {
      method: "PATCH",
      body: { status }
    });
  }
}
