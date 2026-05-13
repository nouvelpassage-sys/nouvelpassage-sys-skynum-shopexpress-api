# Skynum -> ShopExpress Integration Notes

## Current Goal

Synchronize product catalog data from Skynum to ShopExpress, with the first safe production slice focused on stock quantity and sale availability.

For Nouvel Amour rules:

- Bouquets, flower box compositions, fragrance products, toys, and balloons are always available.
- Indoor plants should show real quantity.
- Orders/cash-register integration is useful later, but catalog and stock sync is the priority.

## Skynum API Findings

Docs: `https://api.skynum.com/index.html`

OpenAPI file saved locally as:

`skynum-openapi.yaml`

Authentication:

- Header: `Authorization: Bearer <SKYNUM_API_TOKEN>`
- Header: `Content-Type: application/json`
- API must be enabled for the company/subscription.
- Token should belong to a non-admin Skynum user with API access role.
- Admin users are not allowed to make API requests.

Important limits:

- Avoid frequent polling; Skynum recommends periodic sync from 1 hour.
- API has 10 minutes of total execution time per sliding 1-hour company window.
- Only one write request can run at a time per company.

Token checks:

- `GET /v1/products`
- `GET /v1/stocks`
- `GET /v1/reports/remains`
- `GET /v1/categories`

Provided tokens returned `403`, including a fresh token generated after confirming the user's role has `Доступ до API` enabled. The `Bearer` authorization format was checked and is the expected format from the Skynum docs.

Since the user is non-admin and the role has API access, the remaining likely blocker is company/subscription-level API activation in Skynum, or a missing partner token/API enablement by Skynum support.

## Useful Skynum Endpoints

Catalog:

- `GET /v1/products`
- Query params: `offset`, `limit`, `query`, `category_id`, `updated_from`, `updated_to`, `extended`, `with_images`, `with_custom_fields`, `stock_id`
- Useful fields: `id`, `title`, `code`, `sku`, `category_id`, `category_title`, `visible_in_shop`, `availability_in_shop`, `remains`, `price_retail`, `price_wholesale`, `modifications`, `description`, `short_description`, `title_en`, `description_en`, `short_description_en`

Stock:

- `GET /v1/reports/remains`
- Query params: `date`, `stock_id`, `category_id`, `contragent_id`, `typeprice`
- Useful fields: `product_id`, `product_title`, `product_code`, `product_sku`, `modification_code`, `modification_id`, `quantity`, `price_retail`, `price_wholesale`

Stocks:

- `GET /v1/stocks`

Categories:

- `GET /v1/categories`

## Safe Sync Design

Recommended first live sync:

1. Export products from ShopExpress.
2. Pull Skynum remains.
3. Match by SKU first, then barcode/code.
4. Generate a ShopExpress import CSV with only:
   - `ID`
   - `InStock`
   - `IsAvailable`
5. Import into ShopExpress with:
   - update by `ID`
   - new products: do not create
   - missing products: do nothing
   - import only stock/availability fields

This avoids accidental title/category/price rewrites while we validate product matching.

## ShopExpress API / Integration User Notes

Third-party ShopExpress integration docs consistently describe a separate API user flow:

- ShopExpress API/integration user is created in the ShopExpress admin panel under settings/API.
- Integrations usually need shop URL, API user login, and API user password.
- Product linking can use a key field for automatic matching.
- ShopExpress product ID can be taken from the admin product edit URL.
- Variant linking may require a variant ID plus product ID.

For this project, API writes to ShopExpress should stay disabled until we confirm the official endpoint and payload for product stock updates. The currently safe operational method is still CSV import by ShopExpress `ID`.

## Matching Rules

Preferred mapping:

1. ShopExpress `Sku` <-> Skynum `product_sku`
2. ShopExpress `Barcode` <-> Skynum `product_code`
3. ShopExpress `Barcode` <-> Skynum `modification_code`

Rows without a confident match should be skipped and reported.

## Next Blocking Action

In Skynum:

1. Create or open a non-admin user.
2. Assign role with API access.
3. Generate a new API token.
4. Confirm the company subscription/API access is enabled.
5. Re-run the local stock sync script with `SKYNUM_API_TOKEN` set in the shell environment.
