# SalesBox Product Loading Plan

## Current State

- SalesBox currently shows only 20 products.
- The Shop-Express export contains 303 unique products.
- 281 products have enough data for a practical SalesBox card: image, price, and mapped category.
- 174 products need review before bulk loading, mostly because old export data marks many plants as unavailable or contains old category typos.

## Generated Files

Output folder:

`C:\Users\milan\OneDrive\Desktop\salesbox-product-load`

Files:

- `salesbox-products-all.csv` - all 303 products prepared for review.
- `salesbox-products-ready.csv` - 281 products with image, price, and category.
- `salesbox-products-test-batch-20.csv` - first safe batch for manual or semi-automatic SalesBox loading.
- `salesbox-products-report.json` - summary and category counts.

## Loading Strategy

1. Start with `salesbox-products-test-batch-20.csv`.
2. Load or create 5-20 products in SalesBox.
3. Check how they look in the client app: image, title, price, category, availability, description.
4. If the test batch looks good, continue with `salesbox-products-ready.csv` by category.
5. Keep room plants as a separate phase because their availability depends on real stock.

## Telegram Product Assistant

- Bot can create a local product draft from a Telegram message with photo, price, and a short hint.
- If `OPENAI_API_KEY` is set in `.env`, the bot sends the Telegram photo to the OpenAI Responses API as an image input and uses it to generate Ukrainian and English product names, descriptions, SEO fields, slug, brand, and category.
- If `OPENAI_API_KEY` is missing or GPT is temporarily unavailable, the bot falls back to a basic draft from the text/caption, so product loading does not stop.
- The bot keeps SalesBox writes disabled while `SALESBOX_WRITE_ENABLED=false`; in that mode it saves local drafts and shows what would be sent.

## SalesBox Field Mapping

- Product name: `name_uk`
- Description: `description_uk`
- Price: `active_price_uah`
- Regular price: `regular_price_uah`
- Sale price: `sale_price_uah`
- Category: `salesbox_category`
- Main image: `primary_image_url`
- Extra images: `image_urls`
- SKU/article: `sku`
- External ID: `source_id` or `external_id`
- Availability: `status`
- Quantity mode: `quantity_type`
- Quantity: `quantity`
- Brand: `brand`
- Tags: `tags`

## Rules Used

- Bouquets, flower boxes, author works, hot offers, aroma goods, toys, decor, and cards are treated as available.
- Room plants use stock quantity: if stock is zero, they are marked for review or waiting.
- Old Shop-Express `Unavailable` status is not trusted for SalesBox loading because it was stale in the export.
- Category typos from the old export are not copied directly into SalesBox.

## Items To Fix Before Full Bulk Load

- Decide whether to create SalesBox categories for roses, peonies, and cut flowers or map them into bouquets.
- Confirm how SalesBox import/synchronization works before pressing the synchronization button.
- Fix legal links in SalesBox after the public agreement page on the main site stops returning 500.
- Fill or disable Nova Poshta delivery settings before opening the app for real ordering.
