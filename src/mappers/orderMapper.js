export function normalizeShopExpressOrder(order, statusMapping) {
  const externalId = String(order.id);
  const status = order.status ? statusMapping[order.status] ?? order.status : "new";
  const items = order.items ?? [];

  return {
    externalId,
    externalNumber: order.number ?? externalId,
    status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    currency: order.currency ?? "UAH",
    total: Number(order.total ?? items.reduce((sum, item) => sum + Number(item.total ?? 0), 0)),
    customer: {
      externalId: order.customer?.id === undefined ? undefined : String(order.customer.id),
      name: order.customer?.name,
      email: order.customer?.email,
      phone: order.customer?.phone
    },
    items: items.map((item) => {
      const quantity = Number(item.quantity ?? 1);
      const price = Number(item.price ?? 0);

      return {
        externalId: item.id === undefined ? undefined : String(item.id),
        productExternalId: item.productId === undefined ? undefined : String(item.productId),
        name: item.name ?? item.sku ?? "Unnamed product",
        sku: item.sku,
        barcode: item.barcode,
        quantity,
        price,
        total: Number(item.total ?? quantity * price)
      };
    }),
    delivery: order.delivery,
    payment: order.payment
  };
}

export function toSkynumOrderPayload(order) {
  return {
    externalId: order.externalId,
    source: "shop-express",
    number: order.externalNumber,
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    currency: order.currency,
    total: order.total,
    customer: order.customer,
    items: order.items,
    delivery: order.delivery,
    payment: order.payment
  };
}
