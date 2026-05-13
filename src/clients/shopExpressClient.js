import { HttpClient } from "../http.js";

export class ShopExpressClient {
  constructor(config) {
    this.config = config;
    const token = Buffer.from(`${config.username}:${config.password}`).toString("base64");
    this.http = new HttpClient(config.baseUrl, {
      accept: "application/json",
      authorization: `Basic ${token}`
    });
  }

  async listOrders(updatedFrom) {
    const response = await this.http.request(this.config.ordersListPath, {
      query: {
        updatedFrom: updatedFrom.toISOString()
      }
    });

    if (Array.isArray(response)) {
      return response;
    }

    return response?.data ?? response?.orders ?? [];
  }

  async updateOrderStatus(orderId, status) {
    const path = this.config.orderStatusPathTemplate.replace("{id}", encodeURIComponent(orderId));
    await this.http.request(path, {
      method: "PATCH",
      body: { status }
    });
  }

  async upsertProduct(product) {
    return await this.http.request(this.config.productsUpsertPath, {
      method: "POST",
      body: product
    });
  }

  async updateProductStock(productId, stock) {
    const path = this.config.productStockPathTemplate.replace("{id}", encodeURIComponent(productId));
    await this.http.request(path, {
      method: "PATCH",
      body: { stock }
    });
  }

  async setProductImages(productId, images) {
    const path = this.config.productImagesPathTemplate.replace("{id}", encodeURIComponent(productId));
    await this.http.request(path, {
      method: "POST",
      body: { images }
    });
  }
}
