# SalesBox push and filter setup

## Product payload rules

The Telegram product assistant now sends these SalesBox fields for every new product:

- `price`: retail price from Telegram caption.
- no `basePrice`: base price is intentionally not sent.
- `isTop: true`: show on the main page.
- `order: 1`: keep new work at the top where SalesBox respects the display order field.
- `hashtags`: searchable/client-visible tags for new item, hot showcase, price bucket, occasion, and product type.

The code does not send `filters` or `filterParams` yet because SalesBox expects existing `paramId` and `valueId` pairs. Sending guessed IDs would be unsafe and can break product creation.

## Push schedule target

Target schedule for all-client SalesBox push notifications:

- 10:30 Europe/Kyiv: new products and fresh arrivals.
- 18:30 Europe/Kyiv: new flowers, hot showcase items, and discounts.

Before enabling automatic push sending, confirm the SalesBox notification API endpoint and payload shape from the admin/open API. The current repository has no verified notification writer yet.
